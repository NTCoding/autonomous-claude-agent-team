import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineResult } from './workflow-engine/index.js'
import { WorkflowEngine } from './workflow-engine/index.js'
import type { WorkflowEngineDeps, WorkflowRuntimeDeps } from './workflow-engine/index.js'
import { WorkflowAdapter, StateNameSchema, WorkflowEventSchema, fold } from './workflow-definition/index.js'
import { Workflow } from './workflow-definition/index.js'
import type { BaseEvent } from './workflow-engine/index.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from './infra/environment.js'
import { getGitInfo } from './infra/git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './infra/github.js'
import { readStdinSync } from './infra/stdin.js'
import { readTranscriptMessages } from './infra/transcript.js'
import { runEslintOnFiles } from './infra/linter.js'
import {
  parsePreToolUseInput,
  parseSubagentStartInput,
  parseTeammateIdleInput,
  parseCommonInput,
  formatDenyDecision,
  formatContextInjection,
  EXIT_ALLOW,
  EXIT_ERROR,
  EXIT_BLOCK,
} from './infra/hook-io.js'
import type { ViewerServer } from './infra/workflow-viewer-server.js'
import { startViewerServer } from './infra/workflow-viewer-server.js'
import { createStore, readEvents, appendEvents, hasSession } from './infra/sqlite-event-store.js'
import {
  computeSessionSummary,
  computeCrossSessionSummary,
  formatSessionSummary,
  formatCrossSessionSummary,
} from './infra/workflow-analytics.js'
import { existsSync } from 'node:fs'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type ViewerDeps = {
  readonly startViewer: (dbPath: string) => ViewerServer
}

export type AnalyticsDeps = {
  readonly computeSession: (sessionId: string) => string
  readonly computeAll: () => string
}

export type AdapterDeps = {
  readonly getSessionId: () => string
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowRuntimeDeps
  readonly viewerDeps: ViewerDeps
  readonly analyticsDeps: AnalyticsDeps
}

type CommandHandler = (args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps) => OperationResult

const COMMAND_HANDLERS: Readonly<Record<string, CommandHandler>> = {
  view: handleView,
  analyze: handleAnalyze,
  init: handleInit,
  transition: handleTransition,
  'record-issue': handleRecordIssue,
  'record-branch': handleRecordBranch,
  'record-plan-approval': handleRecordPlanApproval,
  'assign-iteration-task': handleAssignIterationTask,
  'signal-done': handleSignalDone,
  'record-pr': handleRecordPr,
  'create-pr': handleCreatePr,
  'append-issue-checklist': handleAppendIssueChecklist,
  'tick-iteration': handleTickIteration,
  'run-lint': handleRunLint,
  'review-approved': handleReviewApproved,
  'review-rejected': handleReviewRejected,
  'coderabbit-feedback-addressed': handleCoderabbitFeedbackAddressed,
  'coderabbit-feedback-ignored': handleCoderabbitFeedbackIgnored,
  'shut-down': handleShutDown,
  'write-journal': handleWriteJournal,
  'event-context': handleEventContext,
}

const HOOK_HANDLERS: Readonly<Record<string, (engine: WorkflowEngine<Workflow>, deps: AdapterDeps) => OperationResult>> = {
  SessionStart: handleSessionStart,
  PreToolUse: handlePreToolUse,
  SubagentStart: handleSubagentStart,
  TeammateIdle: handleTeammateIdle,
}

export function runWorkflow(args: readonly string[], deps: AdapterDeps): OperationResult {
  const engine = new WorkflowEngine(WorkflowAdapter, deps.engineDeps, deps.workflowDeps)
  const command = args[0]
  if (!command) {
    return runHookMode(engine, deps)
  }
  const handler = COMMAND_HANDLERS[command]
  if (!handler) {
    return { output: `Unknown command: ${command}`, exitCode: EXIT_ERROR }
  }
  return handler(args, engine, deps)
}

function runHookMode(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const stdin = deps.readStdin()
  const cachedDeps: AdapterDeps = { ...deps, readStdin: () => stdin }
  const common = parseCommonInput(stdin)
  const handler = HOOK_HANDLERS[common.hook_event_name]
  if (!handler) {
    return { output: `Unknown hook event: ${common.hook_event_name}`, exitCode: EXIT_ERROR }
  }
  return handler(engine, cachedDeps)
}

function handleView(_args: readonly string[], _engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const server = deps.viewerDeps.startViewer(getDbPath())
  return { output: server.url, exitCode: EXIT_ALLOW }
}

function handleAnalyze(args: readonly string[], _engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  if (args[1] === '--all') {
    return { output: deps.analyticsDeps.computeAll(), exitCode: EXIT_ALLOW }
  }
  const sessionId = args[1]
  if (!sessionId) {
    return { output: 'analyze: missing required argument <sessionId> or --all', exitCode: EXIT_ERROR }
  }
  return { output: deps.analyticsDeps.computeSession(sessionId), exitCode: EXIT_ALLOW }
}

function handleInit(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.startSession(deps.getSessionId()))
}

function handleTransition(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const rawState = args[1]
  if (!rawState) {
    return { output: 'transition: missing required argument <STATE>', exitCode: EXIT_ERROR }
  }
  const parseResult = StateNameSchema.safeParse(rawState)
  if (!parseResult.success) {
    return { output: `transition: invalid state '${rawState}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transition(deps.getSessionId(), parseResult.data))
}

function handleRecordIssue(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return { output: 'record-issue: missing required argument <number>', exitCode: EXIT_ERROR }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return { output: `record-issue: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'record-issue', (w) => w.recordIssue(issueNumber)))
}

function handleRecordBranch(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const branch = args[1]
  if (!branch) {
    return { output: 'record-branch: missing required argument <branch>', exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'record-branch', (w) => w.recordBranch(branch)))
}

function handleRecordPlanApproval(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'record-plan-approval', (w) => w.recordPlanApproval()))
}

function handleAssignIterationTask(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const task = args[1]
  if (!task) {
    return { output: 'assign-iteration-task: missing required argument <task>', exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'assign-iteration-task', (w) => w.assignIterationTask(task)))
}

function handleSignalDone(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'signal-done', (w) => w.signalDone()))
}

function handleRecordPr(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return { output: 'record-pr: missing required argument <number>', exitCode: EXIT_ERROR }
  }
  const prNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(prNumber)) {
    return { output: `record-pr: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'record-pr', (w) => w.recordPr(prNumber)))
}

function handleCreatePr(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const title = args[1]
  const body = args[2]
  if (!title) {
    return { output: 'create-pr: missing required argument <title>', exitCode: EXIT_ERROR }
  }
  if (!body) {
    return { output: 'create-pr: missing required argument <body>', exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'create-pr', (w) => w.createPr(title, body)))
}

function handleAppendIssueChecklist(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const rawNumber = args[1]
  const checklist = args[2]
  if (!rawNumber) {
    return { output: 'append-issue-checklist: missing required argument <issue-number>', exitCode: EXIT_ERROR }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return { output: `append-issue-checklist: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  if (!checklist) {
    return { output: 'append-issue-checklist: missing required argument <checklist>', exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'append-issue-checklist', (w) => w.appendIssueChecklist(issueNumber, checklist)))
}

function handleTickIteration(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return { output: 'tick-iteration: missing required argument <issue-number>', exitCode: EXIT_ERROR }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return { output: `tick-iteration: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(deps.getSessionId(), 'tick-iteration', (w) => w.tickIteration(issueNumber)))
}

function handleRunLint(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const sessionId = deps.getSessionId()
  if (!engine.hasSession(sessionId)) {
    return { output: 'run-lint: no state file. Run init first.', exitCode: EXIT_ALLOW }
  }
  return mapResult(engine.transaction(sessionId, 'run-lint', (w) => w.runLint(args.slice(1))))
}

function handleReviewApproved(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'review-approved', (w) => w.reviewApproved()))
}

function handleReviewRejected(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'review-rejected', (w) => w.reviewRejected()))
}

function handleCoderabbitFeedbackAddressed(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'coderabbit-feedback-addressed', (w) => w.coderabbitFeedbackAddressed()))
}

function handleCoderabbitFeedbackIgnored(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  return mapResult(engine.transaction(deps.getSessionId(), 'coderabbit-feedback-ignored', (w) => w.coderabbitFeedbackIgnored()))
}

function handleShutDown(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const agentName = args[1]
  if (!agentName) {
    return { output: 'shut-down: missing required argument <agent-name>', exitCode: EXIT_ERROR }
  }
  const sessionId = deps.getSessionId()
  if (!engine.hasSession(sessionId)) {
    return { output: `shut-down: no state file for session '${sessionId}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(sessionId, 'shut-down', (w) => w.shutDown(agentName)))
}

function handleSessionStart(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseCommonInput(deps.readStdin())
  engine.persistSessionId(hookInput.session_id)
  return { output: '', exitCode: EXIT_ALLOW }
}

function handlePreToolUse(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())

  if (!engine.hasSession(hookInput.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const filePath = resolveStringField(hookInput.tool_input['file_path'])
    || resolveStringField(hookInput.tool_input['path'])
    || resolveStringField(hookInput.tool_input['pattern'])
  const command = resolveStringField(hookInput.tool_input['command'])

  const hookCheck = engine.transaction(hookInput.session_id, 'hook-check', (w) => {
    const identityCheck = w.verifyIdentity(hookInput.transcript_path)
    if (!identityCheck.pass) return identityCheck
    const pluginCheck = w.checkPluginSourceRead(hookInput.tool_name, filePath, command)
    if (!pluginCheck.pass) return pluginCheck
    const writeCheck = w.checkWriteAllowed(hookInput.tool_name, filePath)
    if (!writeCheck.pass) return writeCheck
    return w.checkBashAllowed(hookInput.tool_name, command)
  })
  if (hookCheck.type === 'blocked') return { output: formatDenyDecision(hookCheck.output), exitCode: EXIT_BLOCK }

  return { output: '', exitCode: EXIT_ALLOW }
}

function handleSubagentStart(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseSubagentStartInput(deps.readStdin())

  if (!engine.hasSession(hookInput.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const result = engine.transaction(hookInput.session_id, 'register-agent', (w) => {
    return w.registerAgent(hookInput.agent_type, hookInput.agent_id)
  })
  /* v8 ignore next */
  const state = result.type === 'success' ? result.output : ''
  return { output: formatContextInjection(state), exitCode: EXIT_ALLOW }
}

function handleTeammateIdle(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseTeammateIdleInput(deps.readStdin())

  if (!engine.hasSession(hookInput.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const agentName = hookInput.teammate_name ?? ''
  const result = engine.transaction(hookInput.session_id, 'check-idle', (w) => w.checkIdleAllowed(agentName))
  if (result.type === 'blocked') {
    return { output: result.output, exitCode: EXIT_BLOCK }
  }

  return { output: '', exitCode: EXIT_ALLOW }
}

function handleWriteJournal(args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const agentName = args[1]
  if (!agentName) {
    return { output: 'write-journal: missing required argument <agent-name>', exitCode: EXIT_ERROR }
  }
  const content = args[2]
  if (!content) {
    return { output: 'write-journal: missing required argument <content>', exitCode: EXIT_ERROR }
  }
  const sessionId = deps.getSessionId()
  if (!engine.hasSession(sessionId)) {
    return { output: 'write-journal: no session. Run init first.', exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transaction(sessionId, 'write-journal', (w) => w.writeJournal(agentName, content)))
}

function handleEventContext(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const sessionId = deps.getSessionId()
  if (!engine.hasSession(sessionId)) {
    return { output: 'event-context: no session. Run init first.', exitCode: EXIT_ERROR }
  }
  const agentName = _args[1] ?? ''
  const events = deps.engineDeps.readEvents(sessionId)
  engine.transaction(sessionId, 'event-context', (w) => w.requestContext(agentName))
  return { output: formatEventContext(events, sessionId), exitCode: EXIT_ALLOW }
}

function formatEventContext(events: readonly BaseEvent[], sessionId: string): string {
  const workflowEvents = events.flatMap((e) => {
    const result = WorkflowEventSchema.safeParse(e)
    return result.success ? [result.data] : []
  })
  const state = fold(workflowEvents)
  const lines: string[] = [
    `Session: ${sessionId}`,
    `State: ${state.state} (iteration: ${state.iteration})`,
  ]
  if (state.activeAgents.length > 0) {
    lines.push(`Active agents: ${state.activeAgents.join(', ')}`)
  }
  if (state.iterations.length > 0) {
    lines.push('')
    lines.push('Iterations:')
    state.iterations.forEach((iter, i) => {
      lines.push(`  [${i}] ${iter.task}`)
    })
  }
  const recentEvents = [...events].reverse().slice(0, 15)
  if (recentEvents.length > 0) {
    lines.push('')
    lines.push(`Recent events (${recentEvents.length}):`)
    recentEvents.forEach((e) => {
      lines.push(`  ${e.at} ${e.type}`)
    })
  }
  return lines.join('\n')
}

function resolveStringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function mapResult(result: EngineResult): OperationResult {
  /* v8 ignore next */
  const exitCode = result.type === 'success' ? EXIT_ALLOW : result.type === 'blocked' ? EXIT_BLOCK : EXIT_ERROR
  return { output: result.output, exitCode }
}

/* v8 ignore start */
function buildRealDeps(): AdapterDeps {
  const store = createStore(getDbPath())

  const engineDeps: WorkflowEngineDeps = {
    readEvents: (sessionId) => readEvents(store, sessionId),
    appendEvents: (sessionId, events) => appendEvents(store, sessionId, events),
    sessionExists: (sessionId) => hasSession(store, sessionId),
    getPluginRoot,
    getEnvFilePath,
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    now: () => new Date().toISOString(),
  }

  const workflowDeps: WorkflowRuntimeDeps = {
    getGitInfo,
    checkPrChecks,
    createDraftPr,
    appendIssueChecklist,
    tickFirstUncheckedIteration,
    runEslintOnFiles,
    fileExists: existsSync,
    getPluginRoot,
    now: () => new Date().toISOString(),
    readTranscriptMessages,
  }

  const viewerDeps: ViewerDeps = {
    startViewer: (dbPath) => startViewerServer(createStore(dbPath), {
      openBrowser: (url) => { import('node:child_process').then(({ exec }) => { exec(`open ${url}`) }) },
      scheduleTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      cancelTimeout: (id) => { globalThis.clearTimeout(id) },
    }),
  }

  const analyticsDeps: AnalyticsDeps = {
    computeSession: (sessionId) => formatSessionSummary(computeSessionSummary(createStore(getDbPath()), sessionId)),
    computeAll: () => formatCrossSessionSummary(computeCrossSessionSummary(createStore(getDbPath()))),
  }

  return {
    getSessionId,
    readStdin: readStdinSync,
    engineDeps,
    workflowDeps,
    viewerDeps,
    analyticsDeps,
  }
}

function main(): void {
  try {
    const result = runWorkflow(process.argv.slice(2), buildRealDeps())
    process.stdout.write(result.output, () => process.exit(result.exitCode))
  } catch (error) {
    const message = `[${new Date().toISOString()}] HOOK ERROR: ${String(error)}\n`
    process.stderr.write(message)
    appendFileSync('/tmp/feature-team-hook-errors.log', message)
    process.exit(EXIT_ERROR)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
/* v8 ignore stop */

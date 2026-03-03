import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineResult } from './workflow-engine/index.js'
import { WorkflowEngine } from './workflow-engine/index.js'
import { WorkflowAdapter, StateNameSchema } from './workflow-definition/index.js'
import type { Workflow } from './workflow-definition/index.js'
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
import { WorkflowError } from './infra/workflow-error.js'
import { buildRealDeps } from './infra/composition-root.js'
import type { ViewerDeps, AnalyticsDeps, AdapterDeps } from './infra/composition-root.js'
export type { ViewerDeps, AnalyticsDeps, AdapterDeps }

type OperationResult = { readonly output: string; readonly exitCode: number }

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
  if (common.hook_event_name !== 'SessionStart' && !engine.hasSession(common.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }
  return handler(engine, cachedDeps)
}

function handleView(_args: readonly string[], _engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const path = deps.viewerDeps.openViewer()
  return { output: path, exitCode: EXIT_ALLOW }
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
  return mapResult(engine.transaction(deps.getSessionId(), 'shut-down', (w) => w.shutDown(agentName)))
}

function handleSessionStart(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseCommonInput(deps.readStdin())
  engine.persistSessionId(hookInput.session_id)
  return { output: '', exitCode: EXIT_ALLOW }
}

function handlePreToolUse(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())

  const filePath = resolveStringField(hookInput.tool_input['file_path'])
    || resolveStringField(hookInput.tool_input['path'])
    || resolveStringField(hookInput.tool_input['pattern'])
  const command = resolveStringField(hookInput.tool_input['command'])

  const hookCheck = engine.transaction(hookInput.session_id, 'hook-check', (w) => {
    const pluginCheck = w.checkPluginSourceRead(hookInput.tool_name, filePath, command)
    if (!pluginCheck.pass) return pluginCheck
    const writeCheck = w.checkWriteAllowed(hookInput.tool_name, filePath)
    if (!writeCheck.pass) return writeCheck
    return w.checkBashAllowed(hookInput.tool_name, command)
  }, hookInput.transcript_path)
  if (hookCheck.type === 'blocked') return { output: formatDenyDecision(hookCheck.output), exitCode: EXIT_BLOCK }

  return { output: '', exitCode: EXIT_ALLOW }
}

function handleSubagentStart(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseSubagentStartInput(deps.readStdin())

  const result = engine.transaction(hookInput.session_id, 'register-agent', (w) => {
    return w.registerAgent(hookInput.agent_type, hookInput.agent_id)
  })
  /* v8 ignore next */
  const state = result.type === 'success' ? result.output : ''
  return { output: formatContextInjection(state), exitCode: EXIT_ALLOW }
}

function handleTeammateIdle(engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const hookInput = parseTeammateIdleInput(deps.readStdin())

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
  return mapResult(engine.transaction(deps.getSessionId(), 'write-journal', (w) => w.writeJournal(agentName, content)))
}

function handleEventContext(_args: readonly string[], engine: WorkflowEngine<Workflow>, deps: AdapterDeps): OperationResult {
  const sessionId = deps.getSessionId()
  const agentName = _args[1] ?? ''
  engine.transaction(sessionId, 'event-context', (w) => w.requestContext(agentName))
  return { output: deps.analyticsDeps.computeEventContext(sessionId), exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new WorkflowError(`Expected string or undefined. Got ${typeof value}: ${String(value)}`)
}

function mapResult(result: EngineResult): OperationResult {
  /* v8 ignore next */
  const exitCode = result.type === 'success' ? EXIT_ALLOW : result.type === 'blocked' ? EXIT_BLOCK : EXIT_ERROR
  return { output: result.output, exitCode }
}

/* v8 ignore start */
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

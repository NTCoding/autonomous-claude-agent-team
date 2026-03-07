import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineResult } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { createWorkflowRunner, defineCommands, arg, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from '@ntcoding/agentic-workflow-builder/cli'
import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { pass } from '@ntcoding/agentic-workflow-builder/dsl'
import { WorkflowAdapter, StateNameSchema, BASH_FORBIDDEN, checkWriteAllowed } from './workflow-definition/index.js'
import type { Workflow, WorkflowDeps } from './workflow-definition/index.js'
import type { StateName, WorkflowOperation, WorkflowState } from './workflow-definition/domain/workflow-types.js'
import {
  parsePreToolUseInput,
  parseSubagentStartInput,
  parseTeammateIdleInput,
  parseCommonInput,
  formatDenyDecision,
  formatContextInjection,
} from './infra/hook-io.js'
import { WorkflowError } from './infra/workflow-error.js'
import { buildRealDeps } from './infra/composition-root.js'
import type { AnalyticsDeps, ReportDeps, ReportResult, AdapterDeps } from './infra/composition-root.js'
export type { AnalyticsDeps, ReportDeps, ReportResult, AdapterDeps }

type Engine = WorkflowEngine<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>

function narrowNumber(v: unknown): number {
  /* v8 ignore next */
  if (typeof v !== 'number') throw new WorkflowError(`Expected number, got ${typeof v}`)
  return v
}

function narrowString(v: unknown): string {
  /* v8 ignore next */
  if (typeof v !== 'string') throw new WorkflowError(`Expected string, got ${typeof v}`)
  return v
}

const COMMANDS = defineCommands<Workflow, WorkflowState>({
  transition:                      { type: 'transition', args: [arg.string('session-id'), arg.state('STATE', StateNameSchema)] },
  'record-issue':                  { type: 'transaction', args: [arg.string('session-id'), arg.number('number')], handler: (w, n) => w.recordIssue(narrowNumber(n)) },
  'record-branch':                 { type: 'transaction', args: [arg.string('session-id'), arg.string('branch')], handler: (w, b) => w.recordBranch(narrowString(b)) },
  'record-plan-approval':          { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.recordPlanApproval() },
  'assign-iteration-task':         { type: 'transaction', args: [arg.string('session-id'), arg.string('task')], handler: (w, t) => w.assignIterationTask(narrowString(t)) },
  'signal-done':                   { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.signalDone() },
  'record-pr':                     { type: 'transaction', args: [arg.string('session-id'), arg.number('number')], handler: (w, n) => w.recordPr(narrowNumber(n)) },
  'create-pr':                     { type: 'transaction', args: [arg.string('session-id'), arg.string('title'), arg.string('body')], handler: (w, t, b) => w.createPr(narrowString(t), narrowString(b)) },
  'append-issue-checklist':        { type: 'transaction', args: [arg.string('session-id'), arg.number('issue-number'), arg.string('checklist')], handler: (w, n, c) => w.appendIssueChecklist(narrowNumber(n), narrowString(c)) },
  'tick-iteration':                { type: 'transaction', args: [arg.string('session-id'), arg.number('issue-number')], handler: (w, n) => w.tickIteration(narrowNumber(n)) },
  'review-approved':               { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.reviewApproved() },
  'review-rejected':               { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.reviewRejected() },
  'coderabbit-feedback-addressed': { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.coderabbitFeedbackAddressed() },
  'coderabbit-feedback-ignored':   { type: 'transaction', args: [arg.string('session-id')], handler: (w) => w.coderabbitFeedbackIgnored() },
  'shut-down':                     { type: 'transaction', args: [arg.string('session-id'), arg.string('agent-name')], handler: (w, name) => w.shutDown(narrowString(name)) },
  'write-journal':                 { type: 'transaction', args: [arg.string('session-id'), arg.string('agent-name'), arg.string('content')], handler: (w, a, c) => w.writeJournal(narrowString(a), narrowString(c)) },
})

const platformRunner = createWorkflowRunner<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>({
  factory: WorkflowAdapter,
  commands: COMMANDS,
})

type CustomCommandHandler = (args: readonly string[], engine: Engine, deps: AdapterDeps) => RunnerResult

const CUSTOM_COMMANDS: Readonly<Record<string, CustomCommandHandler>> = {
  init: handleInit,
  analyze: handleAnalyze,
  'view-report': handleViewReport,
  'event-context': handleEventContext,
  'run-lint': handleRunLint,
}

export function runWorkflow(args: readonly string[], deps: AdapterDeps): RunnerResult {
  const command = args[0]
  if (!command) {
    return runHookMode(deps)
  }
  const customHandler = CUSTOM_COMMANDS[command]
  if (customHandler) {
    const engine = new WorkflowEngine(WorkflowAdapter, deps.engineDeps, deps.workflowDeps)
    return customHandler(args, engine, deps)
  }
  const sessionId = deps.getSessionId()
  return platformRunner([command, sessionId, ...args.slice(1)], deps.engineDeps, deps.workflowDeps)
}

function handleInit(_args: readonly string[], engine: Engine, deps: AdapterDeps): RunnerResult {
  return mapResult(engine.startSession(deps.getSessionId(), undefined, deps.getRepositoryName()))
}

function handleAnalyze(args: readonly string[], _engine: Engine, deps: AdapterDeps): RunnerResult {
  if (args[1] === '--all') {
    return { output: deps.analyticsDeps.computeAll(), exitCode: EXIT_ALLOW }
  }
  const sessionId = args[1]
  if (!sessionId) {
    return { output: 'analyze: missing required argument <sessionId> or --all', exitCode: EXIT_ERROR }
  }
  return { output: deps.analyticsDeps.computeSession(sessionId), exitCode: EXIT_ALLOW }
}

function extractPositionalArgs(args: readonly string[]): readonly string[] {
  const renderIdx = args.indexOf('--render')
  const renderValueIdx = renderIdx === -1 ? -1 : renderIdx + 1
  return args.filter((a, i) => !a.startsWith('--') && i !== renderValueIdx)
}

function handleViewReport(args: readonly string[], _engine: Engine, deps: AdapterDeps): RunnerResult {
  const positionalArgs = extractPositionalArgs(args)
  const sessionId = positionalArgs[1]
  if (!sessionId) {
    return { output: 'view-report: missing required argument <sessionId>', exitCode: EXIT_ERROR }
  }
  const simple = args.includes('--simple')
  const renderIdx = args.indexOf('--render')
  const analysisFile = renderIdx === -1 ? undefined : args[renderIdx + 1]

  try {
    if (simple) {
      return { output: deps.reportDeps.generateReport(sessionId).path, exitCode: EXIT_ALLOW }
    }
    if (analysisFile) {
      const analysis = deps.reportDeps.readAnalysisFile(analysisFile)
      return { output: deps.reportDeps.generateReport(sessionId, { analysis }).path, exitCode: EXIT_ALLOW }
    }
    return { output: deps.reportDeps.getAnalysisContext(sessionId), exitCode: EXIT_ALLOW }
  } catch (error) {
    if (error instanceof WorkflowError) {
      return { output: `view-report: ${error.message}`, exitCode: EXIT_ERROR }
    }
    throw error
  }
}

function handleEventContext(args: readonly string[], engine: Engine, deps: AdapterDeps): RunnerResult {
  const sessionId = deps.getSessionId()
  const agentName = args[1] ?? ''
  engine.transaction(sessionId, 'event-context', (w) => w.requestContext(agentName))
  return { output: deps.analyticsDeps.computeEventContext(sessionId), exitCode: EXIT_ALLOW }
}

function handleRunLint(args: readonly string[], engine: Engine, deps: AdapterDeps): RunnerResult {
  const sessionId = deps.getSessionId()
  if (!engine.hasSession(sessionId)) {
    return { output: 'run-lint: no state file. Run init first.', exitCode: EXIT_ALLOW }
  }
  return mapResult(engine.transaction(sessionId, 'run-lint', (w) => w.runLint(args.slice(1))))
}

const HOOK_HANDLERS: Readonly<Record<string, (engine: Engine, deps: AdapterDeps) => RunnerResult>> = {
  SessionStart: handleSessionStart,
  PreToolUse: handlePreToolUse,
  SubagentStart: handleSubagentStart,
  TeammateIdle: handleTeammateIdle,
}

function runHookMode(deps: AdapterDeps): RunnerResult {
  const engine = new WorkflowEngine(WorkflowAdapter, deps.engineDeps, deps.workflowDeps)
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

function handleSessionStart(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = parseCommonInput(deps.readStdin())
  engine.persistSessionId(hookInput.session_id)
  return { output: '', exitCode: EXIT_ALLOW }
}

function handlePreToolUse(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())

  const filePath = resolveStringField(hookInput.tool_input['file_path'])
    || resolveStringField(hookInput.tool_input['path'])
    || resolveStringField(hookInput.tool_input['pattern'])
  const command = resolveStringField(hookInput.tool_input['command'])

  const pluginCheck = engine.transaction(hookInput.session_id, 'hook-check', (w) => {
    return w.checkPluginSourceRead(hookInput.tool_name, filePath, command)
  }, hookInput.transcript_path)
  if (pluginCheck.type === 'blocked') return { output: formatDenyDecision(pluginCheck.output), exitCode: EXIT_BLOCK }

  const writeCheck = engine.checkWrite(hookInput.session_id, hookInput.tool_name, filePath, checkWriteAllowed, hookInput.transcript_path)
  if (writeCheck.type === 'blocked') return { output: formatDenyDecision(writeCheck.output), exitCode: EXIT_BLOCK }

  const bashCheck = engine.checkBash(hookInput.session_id, hookInput.tool_name, command, BASH_FORBIDDEN, hookInput.transcript_path)
  if (bashCheck.type === 'blocked') return { output: formatDenyDecision(bashCheck.output), exitCode: EXIT_BLOCK }

  return { output: '', exitCode: EXIT_ALLOW }
}

function handleSubagentStart(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = parseSubagentStartInput(deps.readStdin())
  const result = engine.transaction(hookInput.session_id, 'register-agent', (w) => {
    return w.registerAgent(hookInput.agent_type, hookInput.agent_id)
  })
  /* v8 ignore next */
  const state = result.type === 'success' ? result.output : ''
  return { output: formatContextInjection(state), exitCode: EXIT_ALLOW }
}

function handleTeammateIdle(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = parseTeammateIdleInput(deps.readStdin())
  const agentName = hookInput.teammate_name ?? ''
  const result = engine.transaction(hookInput.session_id, 'check-idle', (w) => w.checkIdleAllowed(agentName))
  if (result.type === 'blocked') {
    return { output: result.output, exitCode: EXIT_BLOCK }
  }
  return { output: '', exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new WorkflowError(`Expected string or undefined. Got ${typeof value}: ${String(value)}`)
}

function mapResult(result: EngineResult): RunnerResult {
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

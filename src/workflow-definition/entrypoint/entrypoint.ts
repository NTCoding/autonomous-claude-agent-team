import type { EngineResult, WorkflowEngineDeps } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { createWorkflowRunner, defineRoutes, defineHooks, arg, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from '@ntcoding/agentic-workflow-builder/cli'
import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { FeatureTeamWorkflowDefinition, StateNameSchema } from '../index.js'
import type { Workflow, WorkflowDeps } from '../index.js'
import type { StateName, WorkflowOperation, WorkflowState } from '../domain/workflow-types.js'
import { preToolUseHandler } from './pre-tool-use-handler.js'
import { parseNumber, parseString, parseStringArray } from '../infra/arg-parsing.js'

export type WorkflowEntrypointDeps = {
  readonly getSessionId: () => string
  readonly getRepositoryName: () => string | undefined
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowDeps
}

const ROUTES = defineRoutes<Workflow, WorkflowState>({
  transition:                      { type: 'transition', args: [arg.state('STATE', StateNameSchema)] },
  'record-issue':                  { type: 'transaction', args: [arg.number('number')], handler: (w, n) => w.executeRecording('record-issue', parseNumber(n)) },
  'record-branch':                 { type: 'transaction', args: [arg.string('branch')], handler: (w, b) => w.executeRecording('record-branch', parseString(b)) },
  'record-plan-approval':          { type: 'transaction', args: [], handler: (w) => w.executeRecording('record-plan-approval') },
  'assign-iteration-task':         { type: 'transaction', args: [arg.string('task')], handler: (w, t) => w.executeRecording('assign-iteration-task', parseString(t)) },
  'signal-done':                   { type: 'transaction', args: [], handler: (w) => w.signalDone() },
  'record-pr':                     { type: 'transaction', args: [arg.number('number')], handler: (w, n) => w.executeRecording('record-pr', parseNumber(n)) },
  'create-pr':                     { type: 'transaction', args: [arg.string('title'), arg.string('body')], handler: (w, t, b) => w.createPr(parseString(t), parseString(b)) },
  'append-issue-checklist':        { type: 'transaction', args: [arg.number('issue-number'), arg.string('checklist')], handler: (w, n, c) => w.appendIssueChecklist(parseNumber(n), parseString(c)) },
  'tick-iteration':                { type: 'transaction', args: [arg.number('issue-number')], handler: (w, n) => w.tickIteration(parseNumber(n)) },
  'review-approved':               { type: 'transaction', args: [], handler: (w) => w.reviewApproved() },
  'review-rejected':               { type: 'transaction', args: [], handler: (w) => w.reviewRejected() },
  'coderabbit-feedback-addressed': { type: 'transaction', args: [], handler: (w) => w.coderabbitFeedbackAddressed() },
  'coderabbit-feedback-ignored':   { type: 'transaction', args: [], handler: (w) => w.coderabbitFeedbackIgnored() },
  'shut-down':                     { type: 'transaction', args: [arg.string('agent-name')], handler: (w, name) => w.shutDown(parseString(name)) },
  'write-journal':                 { type: 'transaction', args: [arg.string('agent-name'), arg.string('content')], handler: (w, a, c) => w.writeJournal(parseString(a), parseString(c)) },
  'run-lint':                      { type: 'transaction', args: [arg.rest('files')], handler: (w, files) => w.runLint(parseStringArray(files)) },
  'get-session-summary':           { type: 'transaction', args: [arg.string('agent-name').optional()], handler: (w, name) => w.getSessionSummary(typeof name === 'string' ? name : '') },
})

const HOOKS = defineHooks<Workflow>({
  subagentStart: {
    register: (w, agentType, agentId) => w.registerAgent(agentType, agentId),
  },
  teammateIdle: {
    check: (w, agentName) => w.checkIdleAllowed(agentName),
  },
})

const platformRunner = createWorkflowRunner<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>({
  workflowDefinition: FeatureTeamWorkflowDefinition,
  routes: ROUTES,
  hooks: HOOKS,
  preToolUseHandler,
})

export function runWorkflow(args: readonly string[], deps: WorkflowEntrypointDeps): RunnerResult {
  const command = args[0]
  if (command === 'init') return handleInit(deps)
  return platformRunner(command ? args : [], deps.engineDeps, deps.workflowDeps, {
    readStdin: deps.readStdin,
    getSessionId: deps.getSessionId,
  })
}

function handleInit(deps: WorkflowEntrypointDeps): RunnerResult {
  const engine = new WorkflowEngine(FeatureTeamWorkflowDefinition, deps.engineDeps, deps.workflowDeps)
  return mapResult(engine.startSession(deps.getSessionId(), undefined, deps.getRepositoryName()))
}

function mapResult(result: EngineResult): RunnerResult {
  /* v8 ignore next */
  const exitCode = result.type === 'success' ? EXIT_ALLOW : result.type === 'blocked' ? EXIT_BLOCK : EXIT_ERROR
  return { output: result.output, exitCode }
}

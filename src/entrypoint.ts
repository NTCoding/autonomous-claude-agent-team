import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineResult } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { createWorkflowRunner, defineRoutes, arg, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from '@ntcoding/agentic-workflow-builder/cli'
import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { FeatureTeamWorkflowDefinition, StateNameSchema } from './workflow-definition/index.js'
import type { Workflow, WorkflowDeps } from './workflow-definition/index.js'
import type { StateName, WorkflowOperation, WorkflowState } from './workflow-definition/domain/workflow-types.js'
import { WorkflowError } from './infra/workflow-error.js'
import { buildRealDeps } from './infra/composition-root.js'
import type { AnalyticsDeps, ReportDeps, ReportResult, AdapterDeps } from './infra/composition-root.js'
import { handleHookRoute } from './hook-routes.js'
import { isAnalyticsCommand, routeAnalytics } from './analytics/cli-routes.js'
export type { AnalyticsDeps, ReportDeps, ReportResult, AdapterDeps }

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

function narrowStringArray(v: unknown): readonly string[] {
  /* v8 ignore next */
  if (!Array.isArray(v)) throw new WorkflowError(`Expected string array, got ${typeof v}`)
  return v
}

const ROUTES = defineRoutes<Workflow, WorkflowState>({
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
  'run-lint':                      { type: 'transaction', args: [arg.string('session-id'), arg.rest('files')], handler: (w, files) => w.runLint(narrowStringArray(files)) },
  'get-session-summary':           { type: 'transaction', args: [arg.string('session-id'), arg.string('agent-name').optional()], handler: (w, name) => w.getSessionSummary(typeof name === 'string' ? name : '') },
})

const platformRunner = createWorkflowRunner<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>({
  workflowDefinition: FeatureTeamWorkflowDefinition,
  routes: ROUTES,
})

export function runWorkflow(args: readonly string[], deps: AdapterDeps): RunnerResult {
  const command = args[0]
  if (!command) return handleHookRoute(deps)
  if (command === 'init') return handleInit(deps)
  if (isAnalyticsCommand(command)) return routeAnalytics(command, args, deps)
  const sessionId = deps.getSessionId()
  return platformRunner([command, sessionId, ...args.slice(1)], deps.engineDeps, deps.workflowDeps)
}

function handleInit(deps: AdapterDeps): RunnerResult {
  const engine = new WorkflowEngine(FeatureTeamWorkflowDefinition, deps.engineDeps, deps.workflowDeps)
  return mapResult(engine.startSession(deps.getSessionId(), undefined, deps.getRepositoryName()))
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

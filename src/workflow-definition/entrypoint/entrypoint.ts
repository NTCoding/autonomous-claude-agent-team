import type { EngineResult, WorkflowEngineDeps } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { createWorkflowRunner, defineRoutes, defineHooks, arg, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from '@ntcoding/agentic-workflow-builder/cli'
import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { FeatureTeamWorkflowDefinition, StateNameSchema } from '../index.js'
import type { Workflow, WorkflowDeps } from '../index.js'
import type { StateName, WorkflowOperation, WorkflowState } from '../domain/workflow-types.js'
import { preToolUseHandler } from './pre-tool-use-handler.js'
import { isAnalyticsCommand, routeAnalytics } from './analytics/cli-routes.js'
import { parseNumber, parseString, parseStringArray } from '../../infra/arg-parsing.js'

export type AnalyticsDeps = {
  readonly computeSession: (sessionId: string) => string
  readonly computeAll: () => string
  readonly computeEventContext: (sessionId: string) => string
}

export type ReportResult = {
  readonly path: string
}

export type ReportDeps = {
  readonly getAnalysisContext: (sessionId: string) => string
  readonly generateReport: (sessionId: string, options?: { analysis?: string }) => ReportResult
  readonly readAnalysisFile: (filePath: string) => string
}

export type AdapterDeps = {
  readonly getSessionId: () => string
  readonly getRepositoryName: () => string | undefined
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowDeps
  readonly analyticsDeps: AnalyticsDeps
  readonly reportDeps: ReportDeps
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

export function runWorkflow(args: readonly string[], deps: AdapterDeps): RunnerResult {
  const command = args[0]
  if (command === 'init') return handleInit(deps)
  if (command && isAnalyticsCommand(command)) return routeAnalytics(command, args, deps)
  return platformRunner(command ? args : [], deps.engineDeps, deps.workflowDeps, {
    readStdin: deps.readStdin,
    getSessionId: deps.getSessionId,
  })
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
import { fileURLToPath } from 'node:url'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createStore } from '@ntcoding/agentic-workflow-builder/event-store'
import { getGitInfo, getRepositoryName } from '../../infra/git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from '../../infra/github.js'
import { runEslintOnFiles } from '../../infra/linter.js'
import { readStdinSync } from '../../infra/stdin.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from '../../infra/environment.js'
import {
  computeSessionSummary,
  computeCrossSessionSummary,
  computeEventContext,
  formatSessionSummary,
  formatCrossSessionSummary,
  computeEnhancedSessionSummary,
  buildSessionViewData,
  assembleReportData,
  generateReportHtml,
  formatAnalysisContext,
} from '../../workflow-analysis/index.js'
import { WorkflowEventSchema } from '../index.js'
import { resolveSessionId } from '@ntcoding/agentic-workflow-builder/event-store'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

function buildRealDeps(): AdapterDeps {
  const store = createStore(getDbPath())

  const engineDeps: WorkflowEngineDeps = {
    store,
    getPluginRoot,
    getEnvFilePath,
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    now: () => new Date().toISOString(),
  }

  const workflowDeps: WorkflowDeps = {
    getGitInfo,
    checkPrChecks,
    createDraftPr,
    appendIssueChecklist,
    tickFirstUncheckedIteration,
    runEslintOnFiles,
    fileExists: existsSync,
    getPluginRoot,
    now: () => new Date().toISOString(),
  }

  const analyticsDeps: AnalyticsDeps = {
    computeSession: (sessionId) => formatSessionSummary(computeSessionSummary(createStore(getDbPath()), sessionId)),
    computeAll: () => formatCrossSessionSummary(computeCrossSessionSummary(createStore(getDbPath()))),
    computeEventContext: (sessionId) => computeEventContext(createStore(getDbPath()), sessionId),
  }

  const reportDeps: ReportDeps = {
    getAnalysisContext: (sessionId) => {
      const eventStore = createStore(getDbPath())
      const resolvedId = resolveSessionId(eventStore, sessionId)
      const rawEvents = eventStore.readEvents(resolvedId)
      const events = rawEvents.map((e) => WorkflowEventSchema.parse(e))
      const baseSummary = computeSessionSummary(eventStore, resolvedId)
      const viewData = buildSessionViewData(resolvedId, rawEvents)
      const enhanced = computeEnhancedSessionSummary(baseSummary, viewData, events)
      const enhancedWithRepo = { ...enhanced, repository: enhanced.repository ?? getRepositoryName() }
      const data = assembleReportData(enhancedWithRepo, viewData, [], [], events)
      return formatAnalysisContext(data)
    },
    generateReport: (sessionId, options) => {
      const eventStore = createStore(getDbPath())
      const resolvedId = resolveSessionId(eventStore, sessionId)
      const rawEvents = eventStore.readEvents(resolvedId)
      const events = rawEvents.map((e) => WorkflowEventSchema.parse(e))
      const baseSummary = computeSessionSummary(eventStore, resolvedId)
      const viewData = buildSessionViewData(resolvedId, rawEvents)
      const enhanced = computeEnhancedSessionSummary(baseSummary, viewData, events)
      const enhancedWithRepo = { ...enhanced, repository: enhanced.repository ?? getRepositoryName() }
      const data = assembleReportData(enhancedWithRepo, viewData, [], [], events)
      const html = generateReportHtml(data, options?.analysis)
      const htmlPath = join(tmpdir(), `session-report-${resolvedId}.html`)
      writeFileSync(htmlPath, html)
      try { execSync(`open ${JSON.stringify(htmlPath)}`) } catch { }
      return { path: htmlPath }
    },
    readAnalysisFile: (filePath) => readFileSync(filePath, 'utf8'),
  }

  return {
    getSessionId,
    getRepositoryName,
    readStdin: readStdinSync,
    engineDeps,
    workflowDeps,
    analyticsDeps,
    reportDeps,
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

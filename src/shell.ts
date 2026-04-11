import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { EXIT_ERROR } from '@ntcoding/agentic-workflow-builder/cli'
import { ClaudeCodeTranscriptReader } from '@ntcoding/agentic-workflow-builder/engine'
import { runWorkflow } from './workflow-definition/entrypoint/entrypoint.js'
import type { WorkflowEntrypointDeps } from './workflow-definition/entrypoint/entrypoint.js'
import { isAnalyticsCommand, routeAnalytics } from './workflow-analysis/entrypoint/entrypoint.js'
import type { AnalyticsDeps, ReportDeps } from './workflow-analysis/entrypoint/entrypoint.js'
import { WorkflowError } from './workflow-definition/index.js'

export type ShellDeps = WorkflowEntrypointDeps & {
  readonly analyticsDeps: AnalyticsDeps
  readonly reportDeps: ReportDeps
}

export function route(args: readonly string[], deps: ShellDeps): RunnerResult {
  const command = args[0]
  if (command === 'init') return runWorkflow(args, deps)
  if (command && isAnalyticsCommand(command)) return routeAnalytics(command, args, deps)
  return runWorkflow(args, deps)
}

export function getSessionId(): string {
  const value = process.env['CLAUDE_SESSION_ID']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_SESSION_ID')
  }
  return value
}

export function getPluginRoot(): string {
  const value = process.env['CLAUDE_PLUGIN_ROOT']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_PLUGIN_ROOT')
  }
  return value
}

export function getEnvFilePath(): string {
  const value = process.env['CLAUDE_ENV_FILE']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_ENV_FILE')
  }
  return value
}

export function getDbPath(): string {
  return `${homedir()}/.claude/workflow-events.db`
}

/* v8 ignore start */
import { fileURLToPath } from 'node:url'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createStore } from '@ntcoding/agentic-workflow-builder/event-store'
import type { WorkflowEngineDeps } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowDeps } from './workflow-definition/index.js'
import { getGitInfo, getRepositoryName } from './workflow-definition/infra/git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './workflow-definition/infra/github.js'
import { runEslintOnFiles } from './workflow-definition/infra/linter.js'
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
} from './workflow-analysis/index.js'
import { WorkflowEventSchema } from './workflow-definition/index.js'
import { resolveSessionId } from '@ntcoding/agentic-workflow-builder/event-store'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

function readStdinSync(): string {
  return readFileSync(0, 'utf-8')
}

function buildRealDeps(): ShellDeps {
  const store = createStore(getDbPath())

  const engineDeps: WorkflowEngineDeps = {
    store,
    getPluginRoot,
    getEnvFilePath,
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    now: () => new Date().toISOString(),
    transcriptReader: new ClaudeCodeTranscriptReader(),
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
    const result = route(process.argv.slice(2), buildRealDeps())
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

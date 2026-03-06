import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkflowEngineDeps } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowDeps } from '../workflow-definition/domain/workflow.js'
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
} from '../workflow-analysis/index.js'
import { createStore, resolveSessionId } from '@ntcoding/agentic-workflow-builder/event-store'
import { WorkflowEventSchema } from '../workflow-definition/index.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from './environment.js'
import { getGitInfo, getRepositoryName } from './git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './github.js'
import { readStdinSync } from './stdin.js'
import { readTranscriptMessages } from './transcript.js'
import { runEslintOnFiles } from './linter.js'

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

/* v8 ignore start */
export function buildRealDeps(): AdapterDeps {
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
    readTranscriptMessages,
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
/* v8 ignore stop */

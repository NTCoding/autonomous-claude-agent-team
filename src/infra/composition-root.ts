import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkflowEngineDeps, WorkflowRuntimeDeps } from '../workflow-engine/index.js'
import {
  computeSessionSummary,
  computeCrossSessionSummary,
  computeEventContext,
  formatSessionSummary,
  formatCrossSessionSummary,
  computeEnhancedSessionSummary,
  buildSessionViewData,
  evaluateInsightRules,
  evaluateSuggestionRules,
  assembleReportData,
  generateReportHtml,
} from '../workflow-analysis/index.js'
import { createStore } from '../workflow-event-store/index.js'
import { WorkflowEventSchema } from '../workflow-definition/index.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from './environment.js'
import { getGitInfo } from './git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './github.js'
import { readStdinSync } from './stdin.js'
import { readTranscriptMessages } from './transcript.js'
import { runEslintOnFiles } from './linter.js'

export type AnalyticsDeps = {
  readonly computeSession: (sessionId: string) => string
  readonly computeAll: () => string
  readonly computeEventContext: (sessionId: string) => string
}

export type ReportDeps = {
  readonly generateReport: (sessionId: string) => string
}

export type AdapterDeps = {
  readonly getSessionId: () => string
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowRuntimeDeps
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

  const analyticsDeps: AnalyticsDeps = {
    computeSession: (sessionId) => formatSessionSummary(computeSessionSummary(createStore(getDbPath()), sessionId)),
    computeAll: () => formatCrossSessionSummary(computeCrossSessionSummary(createStore(getDbPath()))),
    computeEventContext: (sessionId) => computeEventContext(createStore(getDbPath()), sessionId),
  }

  const reportDeps: ReportDeps = {
    generateReport: (sessionId) => {
      const eventStore = createStore(getDbPath())
      const rawEvents = eventStore.readEvents(sessionId)
      const events = rawEvents.map((e) => WorkflowEventSchema.parse(e))
      const baseSummary = computeSessionSummary(eventStore, sessionId)
      const viewData = buildSessionViewData(sessionId, rawEvents)
      const enhanced = computeEnhancedSessionSummary(baseSummary, viewData, events)
      const insights = evaluateInsightRules(enhanced, events)
      const suggestions = evaluateSuggestionRules(enhanced, events)
      const data = assembleReportData(enhanced, viewData, insights, suggestions, events)
      const html = generateReportHtml(data)
      const htmlPath = join(tmpdir(), `session-report-${sessionId}.html`)
      writeFileSync(htmlPath, html)
      import('node:child_process').then(({ exec }) => { exec(`open ${htmlPath}`) })
      return htmlPath
    },
  }

  return {
    getSessionId,
    readStdin: readStdinSync,
    engineDeps,
    workflowDeps,
    analyticsDeps,
    reportDeps,
  }
}
/* v8 ignore stop */

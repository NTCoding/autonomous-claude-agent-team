import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { WorkflowEngineDeps, WorkflowRuntimeDeps } from '../workflow-engine/index.js'
import type { ViewerServer } from '../workflow-analysis/index.js'
import { startViewerServer } from '../workflow-analysis/index.js'
import { createStore } from '../workflow-event-store/index.js'
import {
  computeSessionSummary,
  computeCrossSessionSummary,
  computeEventContext,
  formatSessionSummary,
  formatCrossSessionSummary,
} from '../workflow-analysis/index.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from './environment.js'
import { getGitInfo } from './git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './github.js'
import { readStdinSync } from './stdin.js'
import { readTranscriptMessages } from './transcript.js'
import { runEslintOnFiles } from './linter.js'

export type ViewerDeps = {
  readonly startViewer: () => ViewerServer
}

export type AnalyticsDeps = {
  readonly computeSession: (sessionId: string) => string
  readonly computeAll: () => string
  readonly computeEventContext: (sessionId: string) => string
}

export type AdapterDeps = {
  readonly getSessionId: () => string
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowRuntimeDeps
  readonly viewerDeps: ViewerDeps
  readonly analyticsDeps: AnalyticsDeps
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

  const viewerDeps: ViewerDeps = {
    startViewer: () => startViewerServer(createStore(getDbPath()), {
      openBrowser: (url) => { import('node:child_process').then(({ exec }) => { exec(`open ${url}`) }) },
      scheduleTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      cancelTimeout: (id) => { globalThis.clearTimeout(id) },
    }),
  }

  const analyticsDeps: AnalyticsDeps = {
    computeSession: (sessionId) => formatSessionSummary(computeSessionSummary(createStore(getDbPath()), sessionId)),
    computeAll: () => formatCrossSessionSummary(computeCrossSessionSummary(createStore(getDbPath()))),
    computeEventContext: (sessionId) => computeEventContext(createStore(getDbPath()), sessionId),
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
/* v8 ignore stop */

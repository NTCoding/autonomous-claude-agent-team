import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import { EXIT_ALLOW, EXIT_ERROR } from '@ntcoding/agentic-workflow-builder/cli'
import type { AnalyticsDeps, ReportDeps } from '../entrypoint.js'
import { WorkflowError } from '../../../infra/workflow-error.js'

const ANALYTICS_COMMANDS: ReadonlySet<string> = new Set(['analyze', 'view-report'])

export function isAnalyticsCommand(command: string): boolean {
  return ANALYTICS_COMMANDS.has(command)
}

export function routeAnalytics(command: string, args: readonly string[], deps: { readonly analyticsDeps: AnalyticsDeps; readonly reportDeps: ReportDeps }): RunnerResult {
  switch (command) {
    case 'analyze':
      return handleAnalyze(args, deps.analyticsDeps)
    case 'view-report':
      return handleViewReport(args, deps.reportDeps)
    /* v8 ignore next 2 */
    default:
      return { output: `Unknown analytics command: ${command}`, exitCode: EXIT_ERROR }
  }
}

function handleAnalyze(args: readonly string[], analyticsDeps: AnalyticsDeps): RunnerResult {
  if (args[1] === '--all') {
    return { output: analyticsDeps.computeAll(), exitCode: EXIT_ALLOW }
  }
  const sessionId = args[1]
  if (!sessionId) {
    return { output: 'analyze: missing required argument <sessionId> or --all', exitCode: EXIT_ERROR }
  }
  return { output: analyticsDeps.computeSession(sessionId), exitCode: EXIT_ALLOW }
}

function extractPositionalArgs(args: readonly string[]): readonly string[] {
  const renderIdx = args.indexOf('--render')
  const renderValueIdx = renderIdx === -1 ? -1 : renderIdx + 1
  return args.filter((a, i) => !a.startsWith('--') && i !== renderValueIdx)
}

function handleViewReport(args: readonly string[], reportDeps: ReportDeps): RunnerResult {
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
      return { output: reportDeps.generateReport(sessionId).path, exitCode: EXIT_ALLOW }
    }
    if (analysisFile) {
      const analysis = reportDeps.readAnalysisFile(analysisFile)
      return { output: reportDeps.generateReport(sessionId, { analysis }).path, exitCode: EXIT_ALLOW }
    }
    return { output: reportDeps.getAnalysisContext(sessionId), exitCode: EXIT_ALLOW }
  } catch (error) {
    if (error instanceof WorkflowError) {
      return { output: `view-report: ${error.message}`, exitCode: EXIT_ERROR }
    }
    throw error
  }
}

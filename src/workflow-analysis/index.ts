export type { SessionViewData, StatePeriod, IterationGroup } from './session-view.js'
export { buildSessionViewData } from './session-view.js'

export type { EnhancedSessionSummary, IterationMetrics, ReworkAnalysis } from './session-report.js'
export { computeEnhancedSessionSummary } from './session-report.js'

export type { EventCategory, AnnotatedEvent } from './event-display.js'
export { categorizeEvent, extractStructuredFields, extractOutcome, annotateEvents, annotateEventsWithState, annotateEventsWithIteration } from './event-display.js'

export type { InsightSeverity, Insight } from './insight-rules.js'
export { evaluateInsightRules } from './insight-rules.js'

export type { Suggestion } from './suggestion-rules.js'
export { evaluateSuggestionRules } from './suggestion-rules.js'

export type { JournalEntry, ReportData } from './report-assembly.js'
export { enrichJournalEntries, assembleReportData } from './report-assembly.js'

export { generateReportHtml } from './report-html.js'

export type { ParsedInsight, ParsedSuggestion, ParsedAnalysis } from './parse-analysis.js'
export { parseAnalysis } from './parse-analysis.js'

export { formatAnalysisContext } from './analysis-context.js'

export type { SessionSummary, CrossSessionSummary } from './workflow-analytics.js'
export {
  renderBar,
  formatDuration,
  computeSessionSummary,
  computeCrossSessionSummary,
  computeEventContext,
  formatSessionSummary,
  formatCrossSessionSummary,
} from './workflow-analytics.js'

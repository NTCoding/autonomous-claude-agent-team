import type { WorkflowEvent } from '../workflow-definition/index.js'
import type { AnnotatedEvent } from './event-display.js'
import { annotateEvents } from './event-display.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'
import type { Insight } from './insight-rules.js'
import type { Suggestion } from './suggestion-rules.js'

export type JournalEntry = {
  at: string
  agentName: string
  content: string
  iterationIndex: number
  state: string
  context: string
}

export type ReportData = {
  summary: EnhancedSessionSummary
  viewData: SessionViewData
  insights: readonly Insight[]
  suggestions: readonly Suggestion[]
  annotatedEvents: readonly AnnotatedEvent[]
  journalEntries: readonly JournalEntry[]
}

function isDenialEvent(event: WorkflowEvent): boolean {
  switch (event.type) {
    case 'write-checked':
    case 'bash-checked':
    case 'plugin-read-checked':
    case 'idle-checked':
      return !event.allowed
    default:
      return false
  }
}

function ordinalSuffix(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function buildJournalContext(
  annotatedEvent: AnnotatedEvent,
  precedingInIteration: readonly AnnotatedEvent[],
): string {
  const iteration = annotatedEvent.iteration
  const state = annotatedEvent.state
  const prefix = iteration === 0 ? 'Setup' : `Iteration ${iteration}`
  const parts = [`${prefix} · ${state}`]

  const denialCount = precedingInIteration.filter((a) => isDenialEvent(a.event)).length
  if (denialCount > 0) {
    parts.push(`preceded by ${denialCount} hook denial${denialCount === 1 ? '' : 's'}`)
  }

  const rejectionCount = precedingInIteration.filter((a) => a.event.type === 'review-rejected').length
  if (rejectionCount > 0) {
    parts.push(`after ${ordinalSuffix(rejectionCount)} rejection`)
  }

  return parts.join(' · ')
}

type JournalAnnotated = AnnotatedEvent & { event: Extract<WorkflowEvent, { type: 'journal-entry' }> }

function isJournalAnnotated(a: AnnotatedEvent): a is JournalAnnotated {
  return a.event.type === 'journal-entry'
}

export function enrichJournalEntries(annotatedEvents: readonly AnnotatedEvent[]): readonly JournalEntry[] {
  return annotatedEvents
    .filter(isJournalAnnotated)
    .map((a) => {
      const eventIndex = annotatedEvents.indexOf(a)
      const precedingInIteration = annotatedEvents
        .slice(0, eventIndex)
        .filter((p) => p.iteration === a.iteration)
      return {
        at: a.event.at,
        agentName: a.event.agentName,
        content: a.event.content,
        iterationIndex: a.iteration,
        state: a.state,
        context: buildJournalContext(a, precedingInIteration),
      }
    })
}

export function assembleReportData(
  summary: EnhancedSessionSummary,
  viewData: SessionViewData,
  insights: readonly Insight[],
  suggestions: readonly Suggestion[],
  events: readonly WorkflowEvent[],
): ReportData {
  const annotatedEvents = annotateEvents(events)
  return {
    summary,
    viewData,
    insights,
    suggestions,
    annotatedEvents,
    journalEntries: enrichJournalEntries(annotatedEvents),
  }
}

import type { WorkflowEvent } from '../workflow-definition/index.js'
import type { AnnotatedEvent } from './event-display.js'
import { enrichJournalEntries, assembleReportData } from './report-assembly.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'
import type { Insight } from './insight-rules.js'
import type { Suggestion } from './suggestion-rules.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'
const T3 = '2026-01-01T00:03:00.000Z'
const T4 = '2026-01-01T00:04:00.000Z'
const T5 = '2026-01-01T00:05:00.000Z'
const T6 = '2026-01-01T00:06:00.000Z'

function annotated(event: WorkflowEvent, state: string, iteration: number): AnnotatedEvent {
  return { event, state, iteration }
}

describe('enrichJournalEntries', () => {
  it('returns basic context when no denials or rejections precede journal', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'journal-entry' as const, at: T1, agentName: 'developer', content: 'Working on task' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result).toStrictEqual([{
      at: T1,
      agentName: 'developer',
      content: 'Working on task',
      iterationIndex: 1,
      state: 'DEVELOPING',
      context: 'Iteration 1 · DEVELOPING',
    }])
  })

  it('uses singular form for single hook denial', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'src/config/a.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'journal-entry' as const, at: T1, agentName: 'developer', content: 'Retrying' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · preceded by 1 hook denial')
  })

  it('adds hook denial count when preceded by denials in same iteration', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'src/config/a.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'write-checked' as const, at: T1, tool: 'Write', filePath: 'src/config/b.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'write-checked' as const, at: T2, tool: 'Write', filePath: 'src/config/c.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'Using hardcoded values' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · preceded by 3 hook denials')
  })

  it('adds rejection context after review-rejected in same iteration', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'review-rejected' as const, at: T0 }, 'REVIEWING', 1),
      annotated({ type: 'journal-entry' as const, at: T1, agentName: 'developer', content: 'Reworking' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · after 1st rejection')
  })

  it('counts multiple rejections correctly', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'review-rejected' as const, at: T0 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T2 }, 'REVIEWING', 1),
      annotated({ type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'Trying again' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · after 2nd rejection')
  })

  it('uses 3rd ordinal for third rejection', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'review-rejected' as const, at: T0 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T1 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T2 }, 'REVIEWING', 1),
      annotated({ type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'Third try' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · after 3rd rejection')
  })

  it('uses nth ordinal for fourth rejection and beyond', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'review-rejected' as const, at: T0 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T1 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T2 }, 'REVIEWING', 1),
      annotated({ type: 'review-rejected' as const, at: T3 }, 'REVIEWING', 1),
      annotated({ type: 'journal-entry' as const, at: T4, agentName: 'developer', content: 'Fourth try' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · after 4th rejection')
  })

  it('returns empty array when no journal entries exist', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'a.ts', allowed: true }, 'DEVELOPING', 1),
    ]
    expect(enrichJournalEntries(events)).toStrictEqual([])
  })

  it('scopes denial count to same iteration only', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'a.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'New iteration' }, 'DEVELOPING', 2),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 2 · DEVELOPING')
  })

  it('includes both denial and rejection context when both present', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'a.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'write-checked' as const, at: T1, tool: 'Write', filePath: 'b.ts', allowed: false, reason: 'blocked' }, 'DEVELOPING', 1),
      annotated({ type: 'review-rejected' as const, at: T2 }, 'REVIEWING', 1),
      annotated({ type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'After rejection and denials' }, 'DEVELOPING', 1),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Iteration 1 · DEVELOPING · preceded by 2 hook denials · after 1st rejection')
  })

  it('handles iteration 0 journals as pre-iteration', () => {
    const events: readonly AnnotatedEvent[] = [
      annotated({ type: 'journal-entry' as const, at: T0, agentName: 'lead', content: 'Starting' }, 'SPAWN', 0),
    ]
    const result = enrichJournalEntries(events)
    expect(result[0]?.context).toStrictEqual('Setup · SPAWN')
  })
})

describe('assembleReportData', () => {
  const baseSummary: EnhancedSessionSummary = {
    sessionId: 'test-session',
    eventCount: 5,
    duration: '1m 0s',
    iterationCount: 1,
    stateDurations: { DEVELOPING: 60000 },
    reviewOutcomes: { approved: 1, rejected: 0 },
    blockedEpisodes: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    iterationMetrics: [],
    reworkAnalysis: { totalRejections: 0, firstPassApprovalRate: 1, reworkTimeMs: 0, reworkProportion: 0, worstIteration: undefined },
    totalDenials: 0,
    velocityTrend: [],
    transcriptPath: undefined,
    githubIssue: undefined,
    featureBranch: undefined,
    prNumber: undefined,
  }

  const baseViewData: SessionViewData = {
    sessionId: 'test-session',
    startedAt: T0,
    endedAt: T5,
    currentState: 'COMPLETE',
    totalDurationMs: 300000,
    statePeriods: [],
    iterationGroups: [],
    recentEvents: [],
  }

  const baseInsights: readonly Insight[] = [
    { severity: 'success', title: '✓ Session completed', evidence: 'Clean run', prompt: undefined },
  ]

  const baseSuggestions: readonly Suggestion[] = []

  const baseEvents: readonly WorkflowEvent[] = [
    { type: 'session-started' as const, at: T0 },
    { type: 'transitioned' as const, at: T1, from: 'idle', to: 'SPAWN' },
  ]

  it('returns ReportData with all fields populated', () => {
    const result = assembleReportData(baseSummary, baseViewData, baseInsights, baseSuggestions, baseEvents)
    expect(result.summary).toStrictEqual(baseSummary)
    expect(result.viewData).toStrictEqual(baseViewData)
    expect(result.insights).toStrictEqual(baseInsights)
    expect(result.suggestions).toStrictEqual(baseSuggestions)
  })

  it('includes annotated events with both state and iteration', () => {
    const result = assembleReportData(baseSummary, baseViewData, baseInsights, baseSuggestions, baseEvents)
    expect(result.annotatedEvents[0]?.state).toStrictEqual('idle')
    expect(result.annotatedEvents[0]?.iteration).toStrictEqual(0)
  })

  it('returns empty journalEntries when no journal events exist', () => {
    const result = assembleReportData(baseSummary, baseViewData, baseInsights, baseSuggestions, baseEvents)
    expect(result.journalEntries).toStrictEqual([])
  })

  it('includes enriched journal entries when journal events exist', () => {
    const eventsWithJournal: readonly WorkflowEvent[] = [
      { type: 'session-started' as const, at: T0 },
      { type: 'iteration-task-assigned' as const, at: T1, task: 'Do stuff' },
      { type: 'transitioned' as const, at: T2, from: 'RESPAWN', to: 'DEVELOPING' },
      { type: 'journal-entry' as const, at: T3, agentName: 'developer', content: 'Working' },
    ]
    const result = assembleReportData(baseSummary, baseViewData, baseInsights, baseSuggestions, eventsWithJournal)
    expect(result.journalEntries).toHaveLength(1)
    expect(result.journalEntries[0]?.agentName).toStrictEqual('developer')
    expect(result.journalEntries[0]?.content).toStrictEqual('Working')
  })
})

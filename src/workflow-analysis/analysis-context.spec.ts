import { formatAnalysisContext } from './analysis-context.js'
import type { ReportData } from './report-assembly.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'
import type { AnnotatedEvent } from './event-display.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:05:00.000Z'
const T2 = '2026-01-01T00:10:00.000Z'

function buildSummary(overrides: Partial<EnhancedSessionSummary> = {}): EnhancedSessionSummary {
  return {
    sessionId: 'sess-abc-123',
    eventCount: 10,
    duration: '10m 0s',
    iterationCount: 2,
    stateDurations: { DEVELOPING: 300000, REVIEWING: 120000 },
    reviewOutcomes: { approved: 1, rejected: 1 },
    blockedEpisodes: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    iterationMetrics: [],
    reworkAnalysis: { totalRejections: 0, firstPassApprovalRate: 1, reworkTimeMs: 0, reworkProportion: 0, worstIteration: undefined },
    totalDenials: 0,
    velocityTrend: [],
    transcriptPath: undefined,
    repository: undefined,
    githubIssue: undefined,
    featureBranch: undefined,
    prNumber: undefined,
    ...overrides,
  }
}

function buildViewData(overrides: Partial<SessionViewData> = {}): SessionViewData {
  return {
    sessionId: 'sess-abc-123',
    startedAt: T0,
    endedAt: T1,
    currentState: 'COMPLETE',
    totalDurationMs: 300000,
    statePeriods: [],
    iterationGroups: [],
    recentEvents: [],
    ...overrides,
  }
}

function buildReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    summary: buildSummary(),
    viewData: buildViewData(),
    insights: [],
    suggestions: [],
    annotatedEvents: [],
    journalEntries: [],
    ...overrides,
  }
}

describe('formatAnalysisContext — header section', () => {
  it('includes session ID', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).toContain('Session: sess-abc-123')
  })

  it('includes duration and iteration count', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).toContain('Duration: 10m 0s')
    expect(result).toContain('Iterations: 2')
  })

  it('includes final state', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).toContain('Final state: COMPLETE')
  })

  it('includes repository when present', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({ repository: 'owner/repo' }),
    }))
    expect(result).toContain('Repository: owner/repo')
  })

  it('omits repository when absent', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).not.toContain('Repository:')
  })

  it('includes issue, branch, PR when present', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({ githubIssue: 42, featureBranch: 'feature/auth', prNumber: 99 }),
    }))
    expect(result).toContain('Issue: #42')
    expect(result).toContain('Branch: feature/auth')
    expect(result).toContain('PR: #99')
  })

  it('omits issue, branch, PR when absent', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).not.toContain('Issue:')
    expect(result).not.toContain('Branch:')
    expect(result).not.toContain('PR:')
  })
})

describe('formatAnalysisContext — metrics section', () => {
  it('includes rejection count and first-pass rate', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({
        reworkAnalysis: { totalRejections: 3, firstPassApprovalRate: 0.5, reworkTimeMs: 60000, reworkProportion: 0.2, worstIteration: 2 },
      }),
    }))
    expect(result).toContain('Review rejections: 3')
    expect(result).toContain('First-pass approval rate: 50%')
    expect(result).toContain('Rework proportion: 20%')
  })

  it('includes denial breakdown by type when present', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({
        totalDenials: 5,
        hookDenials: { write: 2, bash: 3, pluginRead: 0, idle: 0 },
      }),
    }))
    expect(result).toContain('Hook denials: 5 (write=2, bash=3)')
  })

  it('includes pluginRead and idle denial breakdown when present', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({
        totalDenials: 4,
        hookDenials: { write: 0, bash: 0, pluginRead: 1, idle: 3 },
      }),
    }))
    expect(result).toContain('pluginRead=1')
    expect(result).toContain('idle=3')
  })

  it('omits denial breakdown when all zero', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).toContain('Hook denials: 0')
    expect(result).not.toContain('write=')
  })

  it('includes blocked episodes', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({ blockedEpisodes: 2 }),
    }))
    expect(result).toContain('Blocked episodes: 2')
  })
})

describe('formatAnalysisContext — iteration timeline', () => {
  it('renders iteration summaries with task, duration, rejections', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({
        iterationMetrics: [{
          iterationIndex: 1,
          task: 'Add retry logic',
          durationMs: 300000,
          devTimeMs: 200000,
          reviewTimeMs: 80000,
          commitTimeMs: 20000,
          respawnTimeMs: 0,
          rejectionCount: 1,
          hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
          firstPassApproval: false,
          reworkCycles: 1,
          proportionOfSession: 1,
        }],
      }),
    }))
    expect(result).toContain('Iteration 1: "Add retry logic"')
    expect(result).toContain('Rejections: 1')
    expect(result).toContain('First-pass: no')
  })

  it('includes hook denials per iteration when present', () => {
    const result = formatAnalysisContext(buildReportData({
      summary: buildSummary({
        iterationMetrics: [{
          iterationIndex: 1,
          task: 'Fix auth',
          durationMs: 60000,
          devTimeMs: 40000,
          reviewTimeMs: 20000,
          commitTimeMs: 0,
          respawnTimeMs: 0,
          rejectionCount: 0,
          hookDenials: { write: 2, bash: 0, pluginRead: 0, idle: 0 },
          firstPassApproval: true,
          reworkCycles: 0,
          proportionOfSession: 1,
        }],
      }),
    }))
    expect(result).toContain('Hook denials: 2')
  })

  it('omits iteration section when no iterations', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).not.toContain('## Iteration Timeline')
  })
})

describe('formatAnalysisContext — state transitions', () => {
  it('lists transitioned events chronologically', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'transitioned' as const, at: T0, from: 'SPAWN', to: 'PLANNING' }, state: 'PLANNING', iteration: 0 },
      { event: { type: 'transitioned' as const, at: T1, from: 'PLANNING', to: 'DEVELOPING' }, state: 'DEVELOPING', iteration: 1 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).toContain('## State Transitions')
    expect(result).toContain('SPAWN -> PLANNING')
    expect(result).toContain('PLANNING -> DEVELOPING')
  })

  it('omits section when no transitions', () => {
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: [] }))
    expect(result).not.toContain('## State Transitions')
  })
})

describe('formatAnalysisContext — notable events', () => {
  it('includes denial events with full fields', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'write-checked' as const, at: T0, tool: 'Write', filePath: '/src/foo.ts', allowed: false, reason: 'out of scope' }, state: 'DEVELOPING', iteration: 1 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).toContain('## Notable Events')
    expect(result).toContain('write-checked')
    expect(result).toContain('allowed=false')
  })

  it('includes rejection events', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'review-rejected' as const, at: T0 }, state: 'REVIEWING', iteration: 1 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).toContain('review-rejected')
  })

  it('includes transition to BLOCKED as notable', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'transitioned' as const, at: T0, from: 'DEVELOPING', to: 'BLOCKED' }, state: 'BLOCKED', iteration: 1 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).toContain('## Notable Events')
    expect(result).toContain('to=BLOCKED')
  })

  it('includes transition from BLOCKED as notable', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'transitioned' as const, at: T0, from: 'BLOCKED', to: 'DEVELOPING' }, state: 'DEVELOPING', iteration: 1 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).toContain('## Notable Events')
    expect(result).toContain('from=BLOCKED')
  })

  it('skips non-notable, non-transitioned events like session-started', () => {
    const events: readonly AnnotatedEvent[] = [
      { event: { type: 'session-started' as const, at: T0, transcriptPath: '/tmp/x' }, state: 'SPAWN', iteration: 0 },
    ]
    const result = formatAnalysisContext(buildReportData({ annotatedEvents: events }))
    expect(result).not.toContain('## Notable Events')
  })
})

describe('formatAnalysisContext — journal entries', () => {
  it('includes journal entries with agent and context', () => {
    const result = formatAnalysisContext(buildReportData({
      journalEntries: [{
        at: T1,
        agentName: 'developer',
        content: 'Struggling with auth module',
        iterationIndex: 1,
        state: 'DEVELOPING',
        context: 'Iteration 1 · DEVELOPING',
      }],
    }))
    expect(result).toContain('## Journal Entries')
    expect(result).toContain('[developer]')
    expect(result).toContain('Struggling with auth module')
    expect(result).toContain('Iteration 1 · DEVELOPING')
  })

  it('omits section when no journal entries', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).not.toContain('## Journal Entries')
  })
})

describe('formatAnalysisContext — closing prompt', () => {
  it('ends with analysis instruction', () => {
    const result = formatAnalysisContext(buildReportData())
    expect(result).toContain('Analyze this session')
  })
})

describe('formatAnalysisContext — empty session edge case', () => {
  it('includes header and closing prompt for empty session', () => {
    const data = buildReportData({
      summary: buildSummary({ eventCount: 0, iterationCount: 0, iterationMetrics: [] }),
      annotatedEvents: [],
      journalEntries: [],
    })
    const result = formatAnalysisContext(data)
    expect(result).toContain('Session: sess-abc-123')
    expect(result).toContain('Analyze this session')
  })

  it('omits all optional sections for empty session', () => {
    const data = buildReportData({
      summary: buildSummary({ eventCount: 0, iterationCount: 0, iterationMetrics: [] }),
      annotatedEvents: [],
      journalEntries: [],
    })
    const result = formatAnalysisContext(data)
    expect(result).not.toContain('## Iteration Timeline')
    expect(result).not.toContain('## State Transitions')
    expect(result).not.toContain('## Notable Events')
    expect(result).not.toContain('## Journal Entries')
  })
})

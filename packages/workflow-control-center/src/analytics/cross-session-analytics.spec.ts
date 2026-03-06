import { describe, it, expect } from 'vitest'
import {
  computeOverview,
  computeTrends,
  computePatterns,
  computeEventFrequency,
} from './cross-session-analytics.js'
import type { SessionSummary, ParsedEvent } from '../query/query-types.js'
import type { SessionProjection } from './session-projector.js'

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'session-1',
    currentState: 'DEVELOPING',
    status: 'active',
    totalEvents: 20,
    firstEventAt: '2026-01-01T00:00:00Z',
    lastEventAt: '2026-01-01T01:00:00Z',
    durationMs: 3600000,
    activeAgents: ['lead-1'],
    transitionCount: 5,
    permissionDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 },
    repository: 'test/repo',
    issueNumber: undefined,
    featureBranch: undefined,
    prNumber: undefined,
    ...overrides,
  }
}

function makeProjection(overrides: Partial<SessionProjection> = {}): SessionProjection {
  return {
    sessionId: 'session-1',
    currentState: 'DEVELOPING',
    totalEvents: 20,
    firstEventAt: '2026-01-01T00:00:00Z',
    lastEventAt: '2026-01-01T01:00:00Z',
    activeAgents: ['lead-1'],
    transitionCount: 5,
    permissionDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 },
    repository: 'test/repo',
    issueNumber: undefined,
    featureBranch: undefined,
    prNumber: undefined,
    statePeriods: [
      { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 600000 },
      { state: 'DEVELOPING', startedAt: '2026-01-01T00:10:00Z', endedAt: '2026-01-01T01:00:00Z', durationMs: 3000000 },
    ],
    journalEntries: [],
    journalEntryCount: 0,
    ...overrides,
  }
}

describe('computeOverview', () => {
  it('aggregates session statistics', () => {
    const summaries = [
      makeSummary({ sessionId: 's1', status: 'active' }),
      makeSummary({ sessionId: 's2', status: 'completed' }),
      makeSummary({ sessionId: 's3', status: 'stale' }),
    ]
    const projections = [
      makeProjection({ sessionId: 's1' }),
      makeProjection({ sessionId: 's2' }),
      makeProjection({ sessionId: 's3' }),
    ]

    const overview = computeOverview(summaries, projections)
    expect(overview.totalSessions).toBe(3)
    expect(overview.activeSessions).toBe(1)
    expect(overview.completedSessions).toBe(1)
    expect(overview.staleSessions).toBe(1)
  })

  it('computes averages', () => {
    const summaries = [
      makeSummary({ durationMs: 1000, transitionCount: 4 }),
      makeSummary({ durationMs: 3000, transitionCount: 6 }),
    ]
    const overview = computeOverview(summaries, [makeProjection(), makeProjection()])
    expect(overview.averageDurationMs).toBe(2000)
    expect(overview.averageTransitionCount).toBe(5)
  })

  it('handles empty input', () => {
    const overview = computeOverview([], [])
    expect(overview.totalSessions).toBe(0)
    expect(overview.averageDurationMs).toBe(0)
  })

  it('computes denial hotspots', () => {
    const projections = [
      makeProjection({ permissionDenials: { write: 5, bash: 2, pluginRead: 0, idle: 0 } }),
      makeProjection({ permissionDenials: { write: 3, bash: 0, pluginRead: 1, idle: 0 } }),
    ]
    const overview = computeOverview([makeSummary(), makeSummary()], projections)
    expect(overview.denialHotspots[0]?.target).toBe('write')
    expect(overview.denialHotspots[0]?.count).toBe(8)
  })

  it('includes idle denials in hotspots', () => {
    const projections = [
      makeProjection({ permissionDenials: { write: 0, bash: 0, pluginRead: 0, idle: 3 } }),
    ]
    const overview = computeOverview([makeSummary()], projections)
    const idleHotspot = overview.denialHotspots.find((h) => h.target === 'idle')
    expect(idleHotspot?.count).toBe(3)
  })

  it('computes state time distribution', () => {
    const overview = computeOverview([makeSummary()], [makeProjection()])
    expect(overview.stateTimeDistribution.length).toBeGreaterThan(0)
    const developing = overview.stateTimeDistribution.find((s) => s.state === 'DEVELOPING')
    expect(developing).toBeDefined()
  })
})

describe('computeTrends', () => {
  it('buckets sessions by day', () => {
    const now = new Date()
    const day1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const day1b = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 3600000).toISOString()
    const day2 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [
      makeSummary({ firstEventAt: day1, durationMs: 1000 }),
      makeSummary({ firstEventAt: day1b, durationMs: 3000 }),
      makeSummary({ firstEventAt: day2, durationMs: 2000 }),
    ]
    const trends = computeTrends(summaries, 'duration', 30, 'day')
    expect(trends.length).toBeGreaterThanOrEqual(2)
  })

  it('computes sessions metric', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [
      makeSummary({ firstEventAt: recent }),
      makeSummary({ firstEventAt: recent }),
    ]
    const trends = computeTrends(summaries, 'sessions', 30, 'day')
    expect(trends.length).toBeGreaterThan(0)
  })

  it('computes denials metric', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [
      makeSummary({ firstEventAt: recent, permissionDenials: { write: 2, bash: 1, pluginRead: 0, idle: 0 } }),
    ]
    const trends = computeTrends(summaries, 'denials', 30, 'day')
    expect(trends.length).toBeGreaterThan(0)
    expect(trends[0]?.value).toBe(3)
  })

  it('computes transitions metric', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [makeSummary({ firstEventAt: recent, transitionCount: 10 })]
    const trends = computeTrends(summaries, 'transitions', 30, 'day')
    expect(trends[0]?.value).toBe(10)
  })

  it('returns 0 for unknown metric', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [makeSummary({ firstEventAt: recent })]
    const trends = computeTrends(summaries, 'unknown', 30, 'day')
    expect(trends[0]?.value).toBe(0)
  })

  it('handles duration with empty bucket', () => {
    const trends = computeTrends([], 'duration', 7, 'day')
    expect(trends).toEqual([])
  })

  it('uses weekly buckets', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [makeSummary({ firstEventAt: recent })]
    const trends = computeTrends(summaries, 'sessions', 30, 'week')
    expect(trends.length).toBeGreaterThan(0)
  })

  it('filters by 90d window', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const summaries = [makeSummary({ firstEventAt: recent })]
    const trends = computeTrends(summaries, 'sessions', 90, 'day')
    expect(trends.length).toBeGreaterThan(0)
  })

  it('returns empty for no data', () => {
    expect(computeTrends([], 'duration', 7, 'day')).toEqual([])
  })
})

describe('computePatterns', () => {
  it('finds recurring insight patterns', () => {
    const projections = [
      makeProjection({
        sessionId: 's1',
        permissionDenials: { write: 5, bash: 0, pluginRead: 0, idle: 0 },
      }),
      makeProjection({
        sessionId: 's2',
        permissionDenials: { write: 4, bash: 0, pluginRead: 0, idle: 0 },
      }),
    ]
    const now = new Date('2026-01-01T00:15:00Z')
    const patterns = computePatterns(projections, now)
    expect(patterns.length).toBeGreaterThan(0)
  })

  it('returns empty for no recurring patterns', () => {
    const patterns = computePatterns([], new Date())
    expect(patterns).toEqual([])
  })
})

describe('computeEventFrequency', () => {
  it('counts event types', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:00:00Z', payload: {} },
      { seq: 2, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:01:00Z', payload: {} },
      { seq: 3, sessionId: 's1', type: 'journal-entry', at: '2026-01-01T00:02:00Z', payload: {} },
    ]
    const freq = computeEventFrequency(events)
    expect(freq[0]?.type).toBe('transitioned')
    expect(freq[0]?.count).toBe(2)
    expect(freq[1]?.type).toBe('journal-entry')
  })

  it('returns empty for no events', () => {
    expect(computeEventFrequency([])).toEqual([])
  })
})

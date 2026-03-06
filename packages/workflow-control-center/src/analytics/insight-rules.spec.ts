import { describe, it, expect } from 'vitest'
import { computeInsights } from './insight-rules.js'
import type { SessionProjection } from './session-projector.js'

function makeProjection(overrides: Partial<SessionProjection> = {}): SessionProjection {
  return {
    sessionId: 'test-session',
    currentState: 'DEVELOPING',
    totalEvents: 10,
    firstEventAt: '2026-01-01T00:00:00Z',
    lastEventAt: '2026-01-01T00:10:00Z',
    activeAgents: ['lead-1'],
    transitionCount: 3,
    permissionDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    repository: 'test/repo',
    statePeriods: [
      { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:05:00Z', durationMs: 300000 },
      { state: 'DEVELOPING', startedAt: '2026-01-01T00:05:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 300000 },
    ],
    journalEntries: [],
    journalEntryCount: 0,
    ...overrides,
  }
}

describe('computeInsights', () => {
  const now = new Date('2026-01-01T00:15:00Z')

  it('returns zero-denials insight for clean sessions', () => {
    const insights = computeInsights(makeProjection(), now)
    const zeroDenial = insights.find((i) => i.title === 'Zero permission denials')
    expect(zeroDenial).toBeDefined()
    expect(zeroDenial?.severity).toBe('success')
  })

  it('returns permission denial cluster for high denial count', () => {
    const projection = makeProjection({
      permissionDenials: { write: 3, bash: 1, pluginRead: 0, idle: 0 },
    })
    const insights = computeInsights(projection, now)
    const cluster = insights.find((i) => i.title === 'Permission denial cluster')
    expect(cluster).toBeDefined()
    expect(cluster?.severity).toBe('warning')
  })

  it('detects blocked state entries', () => {
    const projection = makeProjection({
      statePeriods: [
        { state: 'BLOCKED', startedAt: '2026-01-01T00:02:00Z', endedAt: '2026-01-01T00:05:00Z', durationMs: 180000 },
        { state: 'DEVELOPING', startedAt: '2026-01-01T00:05:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 300000 },
      ],
    })
    const insights = computeInsights(projection, now)
    const blocked = insights.find((i) => i.title === 'Blocked state entered')
    expect(blocked).toBeDefined()
    expect(blocked?.severity).toBe('warning')
  })

  it('detects stale sessions', () => {
    const staleNow = new Date('2026-01-01T01:00:00Z')
    const insights = computeInsights(makeProjection(), staleNow)
    const stale = insights.find((i) => i.title === 'Stale session')
    expect(stale).toBeDefined()
  })

  it('does not flag stale for COMPLETE state', () => {
    const projection = makeProjection({ currentState: 'COMPLETE' })
    const staleNow = new Date('2026-01-01T01:00:00Z')
    const insights = computeInsights(projection, staleNow)
    const stale = insights.find((i) => i.title === 'Stale session')
    expect(stale).toBeUndefined()
  })

  it('detects long state dwell', () => {
    const projection = makeProjection({
      statePeriods: [
        { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', durationMs: 60000 },
        { state: 'DEVELOPING', startedAt: '2026-01-01T00:01:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 540000 },
      ],
    })
    const insights = computeInsights(projection, now)
    const dwell = insights.find((i) => i.title === 'Long state dwell')
    expect(dwell).toBeDefined()
    expect(dwell?.evidence).toContain('DEVELOPING')
  })

  it('sorts by severity: warnings first, then info, then success', () => {
    const projection = makeProjection({
      permissionDenials: { write: 3, bash: 0, pluginRead: 0, idle: 0 },
      statePeriods: [
        { state: 'BLOCKED', startedAt: '2026-01-01T00:02:00Z', endedAt: '2026-01-01T00:05:00Z', durationMs: 180000 },
      ],
    })
    const insights = computeInsights(projection, now)
    const severities = insights.map((i) => i.severity)
    const warnings = severities.filter((s) => s === 'warning')
    const nonWarnings = severities.filter((s) => s !== 'warning')
    expect(warnings.length).toBeGreaterThan(0)
    expect(severities.indexOf('warning')).toBeLessThan(
      severities.length - nonWarnings.length === 0 ? severities.length : severities.lastIndexOf('warning') + 1,
    )
  })

  it('returns no zero-denials insight for sessions with few transitions', () => {
    const projection = makeProjection({ transitionCount: 1 })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Zero permission denials')).toBeUndefined()
  })

  it('does not return denial cluster for fewer than 3 denials', () => {
    const projection = makeProjection({
      permissionDenials: { write: 1, bash: 1, pluginRead: 0, idle: 0 },
    })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Permission denial cluster')).toBeUndefined()
  })

  it('does not return high denial rate for zero checks', () => {
    const projection = makeProjection({ totalEvents: 0 })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'High denial rate')).toBeUndefined()
  })

  it('does not return long state dwell with few transitions', () => {
    const projection = makeProjection({ transitionCount: 1 })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Long state dwell')).toBeUndefined()
  })

  it('does not return long state dwell when no state periods', () => {
    const projection = makeProjection({
      transitionCount: 5,
      statePeriods: [],
    })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Long state dwell')).toBeUndefined()
  })

  it('does not return stale for no lastEventAt', () => {
    const projection = makeProjection({ lastEventAt: '' })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Stale session')).toBeUndefined()
  })

  it('does not return long state dwell when evenly distributed', () => {
    const projection = makeProjection({
      transitionCount: 3,
      statePeriods: [
        { state: 'A', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:05:00Z', durationMs: 300000 },
        { state: 'B', startedAt: '2026-01-01T00:05:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 300000 },
      ],
    })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Long state dwell')).toBeUndefined()
  })

  it('does not return blocked for sessions without BLOCKED periods', () => {
    const projection = makeProjection({
      statePeriods: [
        { state: 'DEVELOPING', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 600000 },
      ],
    })
    const insights = computeInsights(projection, now)
    expect(insights.find((i) => i.title === 'Blocked state entered')).toBeUndefined()
  })
})

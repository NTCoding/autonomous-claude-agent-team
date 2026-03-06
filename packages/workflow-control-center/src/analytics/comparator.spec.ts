import { describe, it, expect } from 'vitest'
import { computeDeltas, comparesessions } from './comparator.js'
import type { SessionDetail } from '../query/query-types.js'

function makeDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    sessionId: 'session-1',
    currentState: 'DEVELOPING',
    status: 'active',
    totalEvents: 20,
    firstEventAt: '2026-01-01T00:00:00Z',
    lastEventAt: '2026-01-01T01:00:00Z',
    durationMs: 3600000,
    activeAgents: [],
    transitionCount: 5,
    permissionDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 },
    repository: 'test/repo',
    journalEntries: [],
    insights: [],
    statePeriods: [],
    ...overrides,
  }
}

describe('computeDeltas', () => {
  it('computes absolute deltas between sessions', () => {
    const a = makeDetail({ durationMs: 1000, transitionCount: 5 })
    const b = makeDetail({ durationMs: 2000, transitionCount: 8 })
    const deltas = computeDeltas(a, b)
    expect(deltas.durationMs).toBe(1000)
    expect(deltas.transitionCount).toBe(3)
  })

  it('computes percentage deltas', () => {
    const a = makeDetail({ durationMs: 1000 })
    const b = makeDetail({ durationMs: 1500 })
    const deltas = computeDeltas(a, b)
    expect(deltas.durationPercent).toBe(50)
  })

  it('handles zero values in percentages', () => {
    const a = makeDetail({ durationMs: 0 })
    const b = makeDetail({ durationMs: 1000 })
    const deltas = computeDeltas(a, b)
    expect(deltas.durationPercent).toBe(100)
  })

  it('handles both zero for percentage', () => {
    const a = makeDetail({ durationMs: 0 })
    const b = makeDetail({ durationMs: 0 })
    const deltas = computeDeltas(a, b)
    expect(deltas.durationPercent).toBe(0)
  })

  it('computes denial deltas', () => {
    const a = makeDetail({ permissionDenials: { write: 2, bash: 1, pluginRead: 0, idle: 0 } })
    const b = makeDetail({ permissionDenials: { write: 5, bash: 0, pluginRead: 0, idle: 0 } })
    const deltas = computeDeltas(a, b)
    expect(deltas.totalDenials).toBe(2)
  })
})

describe('comparesessions', () => {
  it('returns both sessions and computed deltas', () => {
    const a = makeDetail({ sessionId: 'a' })
    const b = makeDetail({ sessionId: 'b' })
    const comparison = comparesessions(a, b)
    expect(comparison.sessionA.sessionId).toBe('a')
    expect(comparison.sessionB.sessionId).toBe('b')
    expect(comparison.deltas).toBeDefined()
  })
})

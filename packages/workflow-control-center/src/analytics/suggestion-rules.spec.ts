import { describe, it, expect } from 'vitest'
import { computeSuggestions } from './suggestion-rules.js'
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
    issueNumber: undefined,
    featureBranch: undefined,
    prNumber: undefined,
    statePeriods: [
      { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:05:00Z', durationMs: 300000 },
      { state: 'DEVELOPING', startedAt: '2026-01-01T00:05:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 300000 },
    ],
    journalEntries: [],
    journalEntryCount: 0,
    ...overrides,
  }
}

describe('computeSuggestions', () => {
  const now = new Date('2026-01-01T00:15:00Z')

  it('returns empty array for clean sessions', () => {
    const suggestions = computeSuggestions(makeProjection(), now)
    expect(suggestions).toEqual([])
  })

  it('suggests tightening bash rules when bash denials >= 2', () => {
    const projection = makeProjection({
      permissionDenials: { write: 0, bash: 3, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    const bash = suggestions.find((s) => s.title.includes('bash'))
    expect(bash).toBeDefined()
    expect(bash?.rationale).toContain('3 bash commands')
    expect(bash?.change).toBeDefined()
    expect(bash?.tradeoff).toBeDefined()
    expect(bash?.prompt).toBeDefined()
  })

  it('does not suggest tightening bash rules for < 2 denials', () => {
    const projection = makeProjection({
      permissionDenials: { write: 0, bash: 1, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('bash'))).toBeUndefined()
  })

  it('suggests reducing state dwell when one state > 60%', () => {
    const projection = makeProjection({
      statePeriods: [
        { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', durationMs: 60000 },
        { state: 'DEVELOPING', startedAt: '2026-01-01T00:01:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 540000 },
      ],
    })
    const suggestions = computeSuggestions(projection, now)
    const dwell = suggestions.find((s) => s.title.includes('dwell'))
    expect(dwell).toBeDefined()
    expect(dwell?.rationale).toContain('DEVELOPING')
  })

  it('does not suggest dwell reduction when evenly distributed', () => {
    const suggestions = computeSuggestions(makeProjection(), now)
    expect(suggestions.find((s) => s.title.includes('dwell'))).toBeUndefined()
  })

  it('does not suggest dwell reduction with few transitions', () => {
    const projection = makeProjection({ transitionCount: 1 })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('dwell'))).toBeUndefined()
  })

  it('does not suggest dwell reduction with zero total duration', () => {
    const projection = makeProjection({
      statePeriods: [
        { state: 'A', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:00Z', durationMs: 0 },
      ],
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('dwell'))).toBeUndefined()
  })

  it('does not suggest dwell reduction with empty state periods', () => {
    const projection = makeProjection({
      transitionCount: 5,
      statePeriods: [],
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('dwell'))).toBeUndefined()
  })

  it('suggests write permission guards when write denials >= 2', () => {
    const projection = makeProjection({
      permissionDenials: { write: 3, bash: 0, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    const write = suggestions.find((s) => s.title.includes('write'))
    expect(write).toBeDefined()
    expect(write?.rationale).toContain('3 file write')
  })

  it('does not suggest write guards for < 2 denials', () => {
    const projection = makeProjection({
      permissionDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('write'))).toBeUndefined()
  })

  it('suggests agent handoff improvement for multi-agent sessions with denials', () => {
    const projection = makeProjection({
      activeAgents: ['lead-1', 'dev-1'],
      permissionDenials: { write: 1, bash: 1, pluginRead: 1, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    const handoff = suggestions.find((s) => s.title.includes('handoff'))
    expect(handoff).toBeDefined()
    expect(handoff?.rationale).toContain('2 agents')
  })

  it('does not suggest handoff for single-agent sessions', () => {
    const projection = makeProjection({
      activeAgents: ['lead-1'],
      permissionDenials: { write: 2, bash: 2, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('handoff'))).toBeUndefined()
  })

  it('does not suggest handoff when denials < 3', () => {
    const projection = makeProjection({
      activeAgents: ['lead-1', 'dev-1'],
      permissionDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.find((s) => s.title.includes('handoff'))).toBeUndefined()
  })

  it('returns multiple suggestions when multiple rules match', () => {
    const projection = makeProjection({
      activeAgents: ['lead-1', 'dev-1'],
      permissionDenials: { write: 3, bash: 3, pluginRead: 0, idle: 0 },
      statePeriods: [
        { state: 'SPAWN', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:01:00Z', durationMs: 60000 },
        { state: 'DEVELOPING', startedAt: '2026-01-01T00:01:00Z', endedAt: '2026-01-01T00:10:00Z', durationMs: 540000 },
      ],
    })
    const suggestions = computeSuggestions(projection, now)
    expect(suggestions.length).toBeGreaterThanOrEqual(3)
  })

  it('includes prompt in every suggestion', () => {
    const projection = makeProjection({
      activeAgents: ['lead-1', 'dev-1'],
      permissionDenials: { write: 3, bash: 3, pluginRead: 0, idle: 0 },
    })
    const suggestions = computeSuggestions(projection, now)
    for (const s of suggestions) {
      expect(s.prompt).toBeDefined()
      expect(typeof s.prompt).toBe('string')
      expect(s.prompt?.length).toBeGreaterThan(0)
    }
  })
})

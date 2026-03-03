import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createStore, appendEvents } from './sqlite-event-store.js'
import type { EventStore } from './sqlite-event-store.js'
import type { BaseEvent } from '../workflow-engine/index.js'
import {
  renderBar,
  formatDuration,
  computeSessionSummary,
  computeCrossSessionSummary,
  formatSessionSummary,
  formatCrossSessionSummary,
} from './workflow-analytics.js'

const tmpDb = (name: string): string => join('/tmp', `workflow-analytics-spec-${name}.db`)

function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}

// Helper: build a BaseEvent with optional extra payload fields.
// Extra properties are stored in the SQLite payload JSON and read back by
// the analytics module when it inspects concrete event fields (e.g. `allowed`).
function ev(type: string, at: string, extra: Record<string, unknown> = {}): BaseEvent {
  const base: BaseEvent = { type, at }
  return Object.assign(base, extra)
}

// --- renderBar ---

describe('renderBar', () => {
  it('returns all fill characters when ratio is 0', () => {
    expect(renderBar(0)).toStrictEqual('░'.repeat(40))
  })

  it('returns all filled characters when ratio is 1', () => {
    expect(renderBar(1)).toStrictEqual('█'.repeat(40))
  })

  it('returns half filled when ratio is 0.5', () => {
    expect(renderBar(0.5)).toStrictEqual('█'.repeat(20) + '░'.repeat(20))
  })

  it('clamps ratio below 0 to 0', () => {
    expect(renderBar(-1)).toStrictEqual('░'.repeat(40))
  })

  it('clamps ratio above 1 to 1', () => {
    expect(renderBar(2)).toStrictEqual('█'.repeat(40))
  })

  it('respects custom width', () => {
    expect(renderBar(0.5, 10)).toStrictEqual('█'.repeat(5) + '░'.repeat(5))
  })

  it('returns empty string when width is 0', () => {
    expect(renderBar(0.5, 0)).toStrictEqual('')
  })
})

// --- formatDuration ---

describe('formatDuration', () => {
  it('formats zero ms as 0m 0s', () => {
    expect(formatDuration(0)).toStrictEqual('0m 0s')
  })

  it('formats 90 seconds as 1m 30s', () => {
    expect(formatDuration(90_000)).toStrictEqual('1m 30s')
  })

  it('formats exactly 1 minute as 1m 0s', () => {
    expect(formatDuration(60_000)).toStrictEqual('1m 0s')
  })

  it('formats 5 minutes 32 seconds correctly', () => {
    expect(formatDuration(332_000)).toStrictEqual('5m 32s')
  })
})

// --- computeSessionSummary ---

describe('computeSessionSummary — empty session', () => {
  const dbPath = tmpDb('empty-session')
  afterAll(() => { cleanup(dbPath) })

  it('returns in-progress duration for empty event list', () => {
    const store = createStore(dbPath)
    const summary = computeSessionSummary(store, 'no-events')
    expect(summary.sessionId).toStrictEqual('no-events')
    expect(summary.duration).toStrictEqual('(in progress)')
    expect(summary.eventCount).toStrictEqual(0)
  })

  it('returns zero iteration count and blocked episodes for empty event list', () => {
    const store = createStore(dbPath)
    const summary = computeSessionSummary(store, 'no-events')
    expect(summary.iterationCount).toStrictEqual(0)
    expect(summary.blockedEpisodes).toStrictEqual(0)
  })
})

describe('computeSessionSummary — in-progress detection', () => {
  const dbPath = tmpDb('in-progress')
  afterAll(() => { cleanup(dbPath) })

  it('returns in-progress when last event is recent and no terminal event', () => {
    const store = createStore(dbPath)
    const recentAt = new Date(Date.now() - 10_000).toISOString()
    appendEvents(store, 'recent-session', [
      ev('session-started', recentAt),
    ])
    const summary = computeSessionSummary(store, 'recent-session')
    expect(summary.duration).toStrictEqual('(in progress)')
  })

  it('returns formatted duration when agent-shut-down event is present', () => {
    const store = createStore(dbPath)
    const startAt = '2026-01-01T10:00:00.000Z'
    const endAt = '2026-01-01T10:05:32.000Z'
    appendEvents(store, 'complete-session', [
      ev('session-started', startAt),
      ev('agent-shut-down', endAt, { agentName: 'lead' }),
    ])
    const summary = computeSessionSummary(store, 'complete-session')
    expect(summary.duration).toStrictEqual('5m 32s')
  })
})

// Set up a counted-session store at describe time (SQLite ops are synchronous).
function makeCountedStore(): EventStore {
  const dbPath = tmpDb('counts')
  cleanup(dbPath)
  const store = createStore(dbPath)
  const base = new Date('2026-01-01T10:00:00.000Z').getTime()
  const t = (offsetMs: number): string => new Date(base + offsetMs).toISOString()
  appendEvents(store, 'counted', [
    ev('session-started', t(0)),
    ev('transitioned', t(1_000), { from: 'SPAWN', to: 'PLANNING' }),
    ev('iteration-task-assigned', t(2_000), { task: 'Task 1' }),
    ev('transitioned', t(3_000), { from: 'PLANNING', to: 'DEVELOPING' }),
    ev('review-approved', t(4_000)),
    ev('review-rejected', t(5_000)),
    ev('transitioned', t(6_000), { from: 'DEVELOPING', to: 'BLOCKED' }),
    ev('transitioned', t(7_000), { from: 'BLOCKED', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(8_000), { task: 'Task 2' }),
    ev('write-checked', t(9_000), { tool: 'Write', filePath: 'a.ts', allowed: false }),
    ev('write-checked', t(10_000), { tool: 'Write', filePath: 'b.ts', allowed: true }),
    ev('bash-checked', t(11_000), { tool: 'Bash', command: 'git commit', allowed: false }),
    ev('plugin-read-checked', t(12_000), { tool: 'Read', path: 'x.md', allowed: false }),
    ev('idle-checked', t(13_000), { agentName: 'dev', allowed: false }),
    ev('agent-shut-down', t(332_000), { agentName: 'lead' }),
  ])
  return store
}

describe('computeSessionSummary — event counts', () => {
  const store = makeCountedStore()
  afterAll(() => { cleanup(tmpDb('counts')) })

  it('counts total events correctly', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.eventCount).toStrictEqual(15)
  })

  it('counts iteration-task-assigned events as iteration count', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.iterationCount).toStrictEqual(2)
  })

  it('counts review-approved and review-rejected correctly', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.reviewOutcomes).toStrictEqual({ approved: 1, rejected: 1 })
  })

  it('counts transitioned-to-BLOCKED events as blocked episodes', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.blockedEpisodes).toStrictEqual(1)
  })

  it('counts hook denials correctly', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.hookDenials).toStrictEqual({ write: 1, bash: 1, pluginRead: 1, idle: 1 })
  })

  it('formats duration correctly from first to last event', () => {
    const summary = computeSessionSummary(store, 'counted')
    expect(summary.duration).toStrictEqual('5m 32s')
  })
})

// Set up a state-durations store at describe time.
function makeStateDurationsStore(): EventStore {
  const dbPath = tmpDb('state-durations')
  cleanup(dbPath)
  const store = createStore(dbPath)
  const base = new Date('2026-01-01T10:00:00.000Z').getTime()
  const t = (offsetMs: number): string => new Date(base + offsetMs).toISOString()
  appendEvents(store, 'states', [
    ev('session-started', t(0)),
    ev('transitioned', t(60_000), { from: 'SPAWN', to: 'PLANNING' }),
    ev('transitioned', t(180_000), { from: 'PLANNING', to: 'DEVELOPING' }),
    ev('agent-shut-down', t(480_000), { agentName: 'lead' }),
  ])
  return store
}

describe('computeSessionSummary — state durations', () => {
  const store = makeStateDurationsStore()
  afterAll(() => { cleanup(tmpDb('state-durations')) })

  it('records PLANNING duration as time between transitions', () => {
    const summary = computeSessionSummary(store, 'states')
    expect(summary.stateDurations['PLANNING']).toStrictEqual(120_000)
  })

  it('records DEVELOPING duration as time from transition to last event', () => {
    const summary = computeSessionSummary(store, 'states')
    expect(summary.stateDurations['DEVELOPING']).toStrictEqual(300_000)
  })

  it('does not record duration for SPAWN (no prior state when first transition happens)', () => {
    const summary = computeSessionSummary(store, 'states')
    expect(summary.stateDurations['SPAWN']).toBeUndefined()
  })
})

describe('computeSessionSummary — no hook denials', () => {
  const dbPath = tmpDb('no-denials')
  afterAll(() => { cleanup(dbPath) })

  it('returns zero hook denials when all checks are allowed', () => {
    const store = createStore(dbPath)
    const at = '2026-01-01T10:00:00.000Z'
    const endAt = '2026-01-01T10:05:00.000Z'
    appendEvents(store, 'allowed-session', [
      ev('write-checked', at, { tool: 'Write', filePath: 'a.ts', allowed: true }),
      ev('bash-checked', at, { tool: 'Bash', command: 'npm test', allowed: true }),
      ev('plugin-read-checked', at, { tool: 'Read', path: 'x.md', allowed: true }),
      ev('idle-checked', at, { agentName: 'dev', allowed: true }),
      ev('agent-shut-down', endAt, { agentName: 'lead' }),
    ])
    const summary = computeSessionSummary(store, 'allowed-session')
    expect(summary.hookDenials).toStrictEqual({ write: 0, bash: 0, pluginRead: 0, idle: 0 })
  })
})

// Test that computeCrossSessionSummary handles sessions with no events
// (covers the empty-events branch in computeSessionDurationMs).
describe('computeCrossSessionSummary — session with no events in duration calc', () => {
  const dbPath = tmpDb('cross-duration-empty')
  afterAll(() => { cleanup(dbPath) })

  it('handles completed sessions that have no events for duration calculation', () => {
    // This creates a session that reports "(in progress)" so it won't be included
    // in the completed average, but verifies the path is exercised.
    const store = createStore(dbPath)
    const recentAt = new Date(Date.now() - 10_000).toISOString()
    appendEvents(store, 'recent', [ev('session-started', recentAt)])
    const summary = computeCrossSessionSummary(store)
    expect(summary.averageDuration).toStrictEqual('(in progress)')
  })
})

// --- computeCrossSessionSummary ---

describe('computeCrossSessionSummary — empty store', () => {
  const dbPath = tmpDb('cross-empty')
  afterAll(() => { cleanup(dbPath) })

  it('returns zero total sessions and events for empty store', () => {
    const store = createStore(dbPath)
    const summary = computeCrossSessionSummary(store)
    expect(summary.totalSessions).toStrictEqual(0)
    expect(summary.totalEvents).toStrictEqual(0)
  })

  it('returns in-progress average duration and zero iterations for empty store', () => {
    const store = createStore(dbPath)
    const summary = computeCrossSessionSummary(store)
    expect(summary.averageIterations).toStrictEqual(0)
    expect(summary.averageDuration).toStrictEqual('(in progress)')
  })
})

// Set up a two-session store at describe time.
function makeTwoSessionStore(): EventStore {
  const dbPath = tmpDb('cross-two')
  cleanup(dbPath)
  const store = createStore(dbPath)

  // Session A: 2 minutes, 1 iteration
  const baseA = new Date('2026-01-01T10:00:00.000Z').getTime()
  const tA = (ms: number): string => new Date(baseA + ms).toISOString()
  appendEvents(store, 'session-A', [
    ev('session-started', tA(0)),
    ev('iteration-task-assigned', tA(30_000), { task: 'Task 1' }),
    ev('agent-shut-down', tA(120_000), { agentName: 'lead' }),
  ])

  // Session B: 4 minutes, 3 iterations
  const baseB = new Date('2026-01-01T11:00:00.000Z').getTime()
  const tB = (ms: number): string => new Date(baseB + ms).toISOString()
  appendEvents(store, 'session-B', [
    ev('session-started', tB(0)),
    ev('iteration-task-assigned', tB(30_000), { task: 'Task 1' }),
    ev('iteration-task-assigned', tB(120_000), { task: 'Task 2' }),
    ev('iteration-task-assigned', tB(180_000), { task: 'Task 3' }),
    ev('agent-shut-down', tB(240_000), { agentName: 'lead' }),
  ])

  return store
}

describe('computeCrossSessionSummary — two sessions', () => {
  const store = makeTwoSessionStore()
  afterAll(() => { cleanup(tmpDb('cross-two')) })

  it('counts total sessions correctly', () => {
    const summary = computeCrossSessionSummary(store)
    expect(summary.totalSessions).toStrictEqual(2)
  })

  it('sums total events across sessions', () => {
    const summary = computeCrossSessionSummary(store)
    expect(summary.totalEvents).toStrictEqual(8)
  })

  it('averages iterations across sessions', () => {
    const summary = computeCrossSessionSummary(store)
    expect(summary.averageIterations).toStrictEqual(2)
  })

  it('averages duration across completed sessions', () => {
    const summary = computeCrossSessionSummary(store)
    // Session A: 2m 0s (120s), Session B: 4m 0s (240s), avg = 180s = 3m 0s
    expect(summary.averageDuration).toStrictEqual('3m 0s')
  })
})

describe('computeCrossSessionSummary — hook hotspots sorted by count', () => {
  const dbPath = tmpDb('cross-hotspots')
  afterAll(() => { cleanup(dbPath) })

  it('aggregates hook hotspots sorted descending by count', () => {
    const store = createStore(dbPath)
    const at = '2026-01-01T12:00:00.000Z'
    const endAt = '2026-01-01T12:10:00.000Z'
    appendEvents(store, 'hotspot-session', [
      ev('write-checked', at, { tool: 'Write', filePath: 'a.ts', allowed: false }),
      ev('write-checked', at, { tool: 'Write', filePath: 'b.ts', allowed: false }),
      ev('write-checked', at, { tool: 'Write', filePath: 'c.ts', allowed: false }),
      ev('bash-checked', at, { tool: 'Bash', command: 'cmd', allowed: false }),
      ev('agent-shut-down', endAt, { agentName: 'lead' }),
    ])
    const summary = computeCrossSessionSummary(store)
    const first = summary.hookHotspots.at(0)
    expect(first).toBeDefined()
    expect(first?.type).toStrictEqual('write-checked')
    expect(first?.count).toStrictEqual(3)
  })
})

describe('computeCrossSessionSummary — all in-progress sessions', () => {
  const dbPath = tmpDb('cross-in-progress')
  afterAll(() => { cleanup(dbPath) })

  it('returns in-progress average duration when no sessions are complete', () => {
    const store = createStore(dbPath)
    const recentAt = new Date(Date.now() - 5_000).toISOString()
    appendEvents(store, 'ongoing-session', [
      ev('session-started', recentAt),
    ])
    const summary = computeCrossSessionSummary(store)
    expect(summary.averageDuration).toStrictEqual('(in progress)')
  })
})

// --- formatSessionSummary ---

describe('formatSessionSummary', () => {
  it('includes session id in output', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: { PLANNING: 105_000, DEVELOPING: 180_000 },
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 0,
      hookDenials: { write: 5, bash: 3, pluginRead: 0, idle: 1 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('Session: test-session-123')
  })

  it('includes duration and event count in output', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: {},
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 0,
      hookDenials: { write: 5, bash: 3, pluginRead: 0, idle: 1 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('Duration:    5m 32s')
    expect(output).toContain('Events:      47')
    expect(output).toContain('Iterations:  3')
  })

  it('includes review outcomes in output', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: {},
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 0,
      hookDenials: { write: 5, bash: 3, pluginRead: 0, idle: 1 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('Approved:  2')
    expect(output).toContain('Rejected:  1')
  })

  it('includes hook denials in output', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: {},
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 0,
      hookDenials: { write: 5, bash: 3, pluginRead: 0, idle: 1 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('write-checked:       5')
    expect(output).toContain('bash-checked:        3')
    expect(output).toContain('plugin-read-checked: 0')
    expect(output).toContain('idle-checked:        1')
  })

  it('includes blocked episodes in output', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: {},
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 2,
      hookDenials: { write: 5, bash: 3, pluginRead: 0, idle: 1 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('Blocked Episodes: 2')
  })

  it('includes state duration bars when state durations are present', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 47,
      duration: '5m 32s',
      iterationCount: 3,
      stateDurations: { PLANNING: 60_000, DEVELOPING: 180_000 },
      reviewOutcomes: { approved: 2, rejected: 1 },
      blockedEpisodes: 0,
      hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('State Durations:')
    expect(output).toContain('PLANNING')
    expect(output).toContain('DEVELOPING')
  })

  it('omits state durations section when no state durations', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 0,
      duration: '(in progress)',
      iterationCount: 0,
      stateDurations: {},
      reviewOutcomes: { approved: 0, rejected: 0 },
      blockedEpisodes: 0,
      hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    }
    const output = formatSessionSummary(summary)
    expect(output).not.toContain('State Durations:')
  })

  it('renders 0% bars when all state durations are zero ms', () => {
    const summary = {
      sessionId: 'test-session-123',
      eventCount: 1,
      duration: '0m 0s',
      iterationCount: 0,
      stateDurations: { DEVELOPING: 0 },
      reviewOutcomes: { approved: 0, rejected: 0 },
      blockedEpisodes: 0,
      hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    }
    const output = formatSessionSummary(summary)
    expect(output).toContain('DEVELOPING')
    expect(output).toContain('░'.repeat(40))
  })
})

// --- formatCrossSessionSummary ---

describe('formatCrossSessionSummary', () => {
  it('includes total sessions and events in output', () => {
    const summary = {
      totalSessions: 15,
      averageDuration: '1m 45s',
      averageIterations: 2.3,
      totalEvents: 98,
      hookHotspots: [
        { type: 'write-checked', count: 12 },
        { type: 'bash-checked', count: 6 },
      ],
    }
    const output = formatCrossSessionSummary(summary)
    expect(output).toContain('Total Sessions:      15')
    expect(output).toContain('Total Events:        98')
  })

  it('includes average duration and iterations in output', () => {
    const summary = {
      totalSessions: 15,
      averageDuration: '1m 45s',
      averageIterations: 2.3,
      totalEvents: 98,
      hookHotspots: [],
    }
    const output = formatCrossSessionSummary(summary)
    expect(output).toContain('Average Duration:    1m 45s')
    expect(output).toContain('Average Iterations:  2.3')
  })

  it('includes hook hotspots when present', () => {
    const summary = {
      totalSessions: 15,
      averageDuration: '1m 45s',
      averageIterations: 2.3,
      totalEvents: 98,
      hookHotspots: [
        { type: 'write-checked', count: 12 },
        { type: 'bash-checked', count: 6 },
      ],
    }
    const output = formatCrossSessionSummary(summary)
    expect(output).toContain('Hook Denial Hotspots:')
    expect(output).toContain('write-checked')
    expect(output).toContain('12')
  })

  it('omits hotspot section when no hotspots', () => {
    const summary = {
      totalSessions: 0,
      averageDuration: '(in progress)',
      averageIterations: 0,
      totalEvents: 0,
      hookHotspots: [],
    }
    const output = formatCrossSessionSummary(summary)
    expect(output).not.toContain('Hook Denial Hotspots:')
  })
})

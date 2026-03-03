import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore } from '../workflow-event-store/sqlite-event-store.js'
import type { BaseEvent } from '../workflow-engine/index.js'
import {
  renderBar,
  formatDuration,
  computeSessionSummary,
  computeCrossSessionSummary,
  computeEventContext,
  formatSessionSummary,
  formatCrossSessionSummary,
} from './workflow-analytics.js'

const tmpDb = (name: string): string => join(tmpdir(), `workflow-analytics-spec-${name}.db`)

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

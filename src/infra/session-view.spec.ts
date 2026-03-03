import type { BaseEvent } from '../workflow-engine/index.js'
import { buildSessionViewData, buildSessionListItem } from './session-view.js'

function ev(type: string, at: string, extra: Record<string, unknown> = {}): BaseEvent {
  return { type, at, ...extra }
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'
const T3 = '2026-01-01T00:03:00.000Z'
const T4 = '2026-01-01T00:04:00.000Z'

describe('buildSessionViewData', () => {
  describe('empty events', () => {
    it('returns idle state and zero duration when events is empty', () => {
      const result = buildSessionViewData('sess-1', [])
      expect(result.sessionId).toStrictEqual('sess-1')
      expect(result.currentState).toStrictEqual('idle')
      expect(result.totalDurationMs).toStrictEqual(0)
    })

    it('returns empty collections when events is empty', () => {
      const result = buildSessionViewData('sess-1', [])
      expect(result.statePeriods).toStrictEqual([])
      expect(result.iterationGroups).toStrictEqual([])
      expect(result.recentEvents).toStrictEqual([])
    })

    it('returns epoch startedAt when events is empty', () => {
      const result = buildSessionViewData('sess-1', [])
      expect(result.startedAt).toStrictEqual(new Date(0).toISOString())
    })

    it('returns no endedAt when events is empty', () => {
      const result = buildSessionViewData('sess-1', [])
      expect(result.endedAt).toBeUndefined()
    })
  })

  describe('startedAt and endedAt', () => {
    it('startedAt is the first event timestamp', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.startedAt).toStrictEqual(T0)
    })

    it('endedAt is undefined when no session-ended event exists', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.endedAt).toBeUndefined()
    })

    it('endedAt is the session-ended event timestamp', () => {
      const events = [
        ev('ev.a', T0),
        ev('workflow.session.ended', T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.endedAt).toStrictEqual(T2)
    })
  })

  describe('currentState', () => {
    it('returns idle when no transition events exist', () => {
      const events = [ev('ev.a', T0)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.currentState).toStrictEqual('idle')
    })

    it('returns the last toState from transition events', () => {
      const events = [
        ev('workflow.state.transitioned', T0, { toState: 'working' }),
        ev('workflow.state.transitioned', T1, { toState: 'reviewing' }),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.currentState).toStrictEqual('reviewing')
    })
  })

  describe('totalDurationMs', () => {
    it('computes duration between first and last event', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.totalDurationMs).toStrictEqual(2 * 60 * 1000)
    })

    it('returns 0 for a single event', () => {
      const events = [ev('ev.a', T0)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.totalDurationMs).toStrictEqual(0)
    })
  })

  describe('recentEvents', () => {
    it('returns all events when count <= 20', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1), ev('ev.c', T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toStrictEqual(events)
    })

    it('returns last 20 events when count > 20', () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        ev(`ev.${i}`, new Date(i * 1000).toISOString())
      )
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toStrictEqual(events.slice(-20))
    })

    it('returns exactly 20 events when count is 20', () => {
      const events = Array.from({ length: 20 }, (_, i) =>
        ev(`ev.${i}`, new Date(i * 1000).toISOString())
      )
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toHaveLength(20)
    })
  })

  describe('statePeriods', () => {
    it('returns a single period covering the full session when no transitions', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods).toHaveLength(1)
      expect(result.statePeriods[0]?.state).toStrictEqual('idle')
    })

    it('computes multiple state periods from transitions', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('workflow.state.transitioned', T2, { toState: 'reviewing' }),
        ev('ev.end', T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods).toHaveLength(3)
      expect(result.statePeriods[0]?.state).toStrictEqual('idle')
      expect(result.statePeriods[1]?.state).toStrictEqual('working')
      expect(result.statePeriods[2]?.state).toStrictEqual('reviewing')
    })

    it('proportions sum to 1.0 for multi-state sessions', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('workflow.state.transitioned', T2, { toState: 'reviewing' }),
        ev('ev.end', T4),
      ]
      const result = buildSessionViewData('sess-1', events)
      const total = result.statePeriods.reduce((sum, p) => sum + p.proportionOfTotal, 0)
      expect(Math.round(total * 1000) / 1000).toStrictEqual(1)
    })

    it('all proportions are 0 when totalDurationMs is 0', () => {
      const events = [
        ev('workflow.state.transitioned', T0, { toState: 'working' }),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods.every((p) => p.proportionOfTotal === 0)).toStrictEqual(true)
    })

    it('endedAt is set on a period when next transition exists', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('ev.end', T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods[0]?.endedAt).toStrictEqual(T1)
    })

    it('last period endedAt is set from session-ended event', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('workflow.session.ended', T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      const last = result.statePeriods[result.statePeriods.length - 1]
      expect(last?.endedAt).toStrictEqual(T2)
    })

    it('last period endedAt is undefined when session has not ended', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('ev.more', T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      const last = result.statePeriods[result.statePeriods.length - 1]
      expect(last?.endedAt).toBeUndefined()
    })

    it('durationMs for each period is correct', () => {
      const events = [
        ev('ev.start', T0),
        ev('workflow.state.transitioned', T1, { toState: 'working' }),
        ev('ev.end', T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods[0]?.durationMs).toStrictEqual(60 * 1000)
      expect(result.statePeriods[1]?.durationMs).toStrictEqual(60 * 1000)
    })
  })

  describe('iterationGroups', () => {
    it('returns empty groups when no task-assigned events exist', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups).toHaveLength(1)
      expect(result.iterationGroups[0]?.task).toStrictEqual('')
    })

    it('groups events by iteration boundary', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('ev.a', T1),
        ev('workflow.iteration.task-assigned', T2, { task: 'task-2' }),
        ev('ev.b', T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups).toHaveLength(2)
      expect(result.iterationGroups[0]?.task).toStrictEqual('task-1')
      expect(result.iterationGroups[1]?.task).toStrictEqual('task-2')
    })

    it('assigns correct iterationIndex to each group', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('ev.a', T1),
        ev('workflow.iteration.task-assigned', T2, { task: 'task-2' }),
        ev('ev.b', T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.iterationIndex).toStrictEqual(0)
      expect(result.iterationGroups[1]?.iterationIndex).toStrictEqual(1)
    })

    it('events within each iteration group are correct', () => {
      const eventA = ev('workflow.iteration.task-assigned', T0, { task: 'task-1' })
      const eventB = ev('ev.work', T1)
      const eventC = ev('workflow.iteration.task-assigned', T2, { task: 'task-2' })
      const events = [eventA, eventB, eventC]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.events).toStrictEqual([eventA, eventB])
      expect(result.iterationGroups[1]?.events).toStrictEqual([eventC])
    })

    it('startedAt of each group matches task-assigned event timestamp', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('workflow.iteration.task-assigned', T2, { task: 'task-2' }),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.startedAt).toStrictEqual(T0)
      expect(result.iterationGroups[1]?.startedAt).toStrictEqual(T2)
    })

    it('endedAt of completed groups is the last event timestamp', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('ev.work', T1),
        ev('workflow.iteration.task-assigned', T2, { task: 'task-2' }),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.endedAt).toStrictEqual(T1)
    })

    it('last group has no endedAt', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('ev.work', T1),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.endedAt).toBeUndefined()
    })
  })
})

describe('buildSessionListItem', () => {
  describe('empty events', () => {
    it('returns idle state and zero counts when events is empty', () => {
      const result = buildSessionListItem('sess-2', [])
      expect(result.sessionId).toStrictEqual('sess-2')
      expect(result.durationMs).toStrictEqual(0)
      expect(result.iterationCount).toStrictEqual(0)
      expect(result.currentState).toStrictEqual('idle')
    })

    it('returns epoch startedAt when events is empty', () => {
      const result = buildSessionListItem('sess-2', [])
      expect(result.startedAt).toStrictEqual(new Date(0).toISOString())
    })

    it('returns no endedAt when events is empty', () => {
      const result = buildSessionListItem('sess-2', [])
      expect(result.endedAt).toBeUndefined()
    })
  })

  describe('with events', () => {
    it('startedAt is the first event timestamp', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T2)]
      const result = buildSessionListItem('sess-2', events)
      expect(result.startedAt).toStrictEqual(T0)
    })

    it('durationMs is computed from first to last event', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T2)]
      const result = buildSessionListItem('sess-2', events)
      expect(result.durationMs).toStrictEqual(2 * 60 * 1000)
    })

    it('iterationCount counts task-assigned events', () => {
      const events = [
        ev('workflow.iteration.task-assigned', T0, { task: 'task-1' }),
        ev('ev.work', T1),
        ev('workflow.iteration.task-assigned', T2, { task: 'task-2' }),
      ]
      const result = buildSessionListItem('sess-2', events)
      expect(result.iterationCount).toStrictEqual(2)
    })

    it('currentState is last toState from transition events', () => {
      const events = [
        ev('workflow.state.transitioned', T0, { toState: 'working' }),
        ev('workflow.state.transitioned', T1, { toState: 'done' }),
      ]
      const result = buildSessionListItem('sess-2', events)
      expect(result.currentState).toStrictEqual('done')
    })

    it('endedAt is session-ended event timestamp', () => {
      const events = [
        ev('ev.a', T0),
        ev('workflow.session.ended', T2),
      ]
      const result = buildSessionListItem('sess-2', events)
      expect(result.endedAt).toStrictEqual(T2)
    })

    it('endedAt is undefined when no session-ended event', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1)]
      const result = buildSessionListItem('sess-2', events)
      expect(result.endedAt).toBeUndefined()
    })

    it('returns 0 iterationCount when no task-assigned events', () => {
      const events = [ev('ev.a', T0), ev('ev.b', T1)]
      const result = buildSessionListItem('sess-2', events)
      expect(result.iterationCount).toStrictEqual(0)
    })
  })
})

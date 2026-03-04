import type { BaseEvent } from '../workflow-engine/index.js'
import { buildSessionViewData } from './session-view.js'

function ev(type: string, at: string, extra: Record<string, unknown> = {}): BaseEvent {
  const base: BaseEvent = { type, at }
  return Object.assign(base, extra)
}

function transition(at: string, from: string, to: string): BaseEvent {
  return ev('transitioned', at, { from, to })
}

function taskAssigned(at: string, task: string): BaseEvent {
  return ev('iteration-task-assigned', at, { task })
}

function sessionStarted(at: string): BaseEvent {
  return ev('session-started', at)
}

function planApproval(at: string): BaseEvent {
  return ev('plan-approval-recorded', at)
}

function devDone(at: string): BaseEvent {
  return ev('developer-done-signaled', at)
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

    it('treats unparseable events same as empty', () => {
      const events = [{ type: 'unknown-garbage', at: T0 }]
      const result = buildSessionViewData('sess-1', events)
      expect(result.currentState).toStrictEqual('idle')
      expect(result.totalDurationMs).toStrictEqual(0)
    })
  })

  describe('startedAt and endedAt', () => {
    it('startedAt is the first event timestamp', () => {
      const events = [sessionStarted(T0), planApproval(T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.startedAt).toStrictEqual(T0)
    })

    it('endedAt is undefined when no COMPLETE transition exists', () => {
      const events = [sessionStarted(T0), planApproval(T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.endedAt).toBeUndefined()
    })

    it('endedAt is the COMPLETE transition timestamp', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'PR_CREATION', 'COMPLETE'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.endedAt).toStrictEqual(T1)
    })
  })

  describe('currentState', () => {
    it('returns idle when no transition events exist', () => {
      const events = [sessionStarted(T0)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.currentState).toStrictEqual('idle')
    })

    it('returns the last to-state from transition events', () => {
      const events = [
        transition(T0, 'SPAWN', 'PLANNING'),
        transition(T1, 'PLANNING', 'DEVELOPING'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.currentState).toStrictEqual('DEVELOPING')
    })
  })

  describe('totalDurationMs', () => {
    it('computes duration between first and last event', () => {
      const events = [sessionStarted(T0), planApproval(T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.totalDurationMs).toStrictEqual(2 * 60 * 1000)
    })

    it('returns 0 for a single event', () => {
      const events = [sessionStarted(T0)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.totalDurationMs).toStrictEqual(0)
    })
  })

  describe('recentEvents', () => {
    it('returns all events when count <= 20', () => {
      const events = [sessionStarted(T0), planApproval(T1), devDone(T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toHaveLength(3)
    })

    it('returns last 20 events when count > 20', () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        planApproval(new Date(i * 1000).toISOString())
      )
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toHaveLength(20)
    })

    it('returns exactly 20 events when count is 20', () => {
      const events = Array.from({ length: 20 }, (_, i) =>
        planApproval(new Date(i * 1000).toISOString())
      )
      const result = buildSessionViewData('sess-1', events)
      expect(result.recentEvents).toHaveLength(20)
    })
  })

  describe('statePeriods', () => {
    it('returns a single period covering the full session when no transitions', () => {
      const events = [sessionStarted(T0), planApproval(T2)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods).toHaveLength(1)
      expect(result.statePeriods[0]?.state).toStrictEqual('idle')
    })

    it('computes multiple state periods from transitions', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        transition(T2, 'PLANNING', 'DEVELOPING'),
        devDone(T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods).toHaveLength(3)
      expect(result.statePeriods[0]?.state).toStrictEqual('idle')
      expect(result.statePeriods[1]?.state).toStrictEqual('PLANNING')
      expect(result.statePeriods[2]?.state).toStrictEqual('DEVELOPING')
    })

    it('proportions sum to 1.0 for multi-state sessions', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        transition(T2, 'PLANNING', 'DEVELOPING'),
        devDone(T4),
      ]
      const result = buildSessionViewData('sess-1', events)
      const total = result.statePeriods.reduce((sum, p) => sum + p.proportionOfTotal, 0)
      expect(Math.round(total * 1000) / 1000).toStrictEqual(1)
    })

    it('all proportions are 0 when totalDurationMs is 0', () => {
      const events = [
        transition(T0, 'SPAWN', 'PLANNING'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods.every((p) => p.proportionOfTotal === 0)).toStrictEqual(true)
    })

    it('endedAt is set on a period when next transition exists', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        planApproval(T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods[0]?.endedAt).toStrictEqual(T1)
    })

    it('last period endedAt is set when session completes', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        transition(T2, 'PR_CREATION', 'COMPLETE'),
      ]
      const result = buildSessionViewData('sess-1', events)
      const last = result.statePeriods[result.statePeriods.length - 1]
      expect(last?.endedAt).toStrictEqual(T2)
    })

    it('last period endedAt is undefined when session has not ended', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        planApproval(T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      const last = result.statePeriods[result.statePeriods.length - 1]
      expect(last?.endedAt).toBeUndefined()
    })

    it('durationMs for each period is correct', () => {
      const events = [
        sessionStarted(T0),
        transition(T1, 'SPAWN', 'PLANNING'),
        planApproval(T2),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.statePeriods[0]?.durationMs).toStrictEqual(60 * 1000)
      expect(result.statePeriods[1]?.durationMs).toStrictEqual(60 * 1000)
    })
  })

  describe('iterationGroups', () => {
    it('returns single group with empty task when no task-assigned events exist', () => {
      const events = [sessionStarted(T0), planApproval(T1)]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups).toHaveLength(1)
      expect(result.iterationGroups[0]?.task).toStrictEqual('')
    })

    it('groups events by iteration boundary', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        planApproval(T1),
        taskAssigned(T2, 'task-2'),
        devDone(T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups).toHaveLength(2)
      expect(result.iterationGroups[0]?.task).toStrictEqual('task-1')
      expect(result.iterationGroups[1]?.task).toStrictEqual('task-2')
    })

    it('assigns correct iterationIndex to each group', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        planApproval(T1),
        taskAssigned(T2, 'task-2'),
        devDone(T3),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.iterationIndex).toStrictEqual(0)
      expect(result.iterationGroups[1]?.iterationIndex).toStrictEqual(1)
    })

    it('events within each iteration group are correct', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        planApproval(T1),
        taskAssigned(T2, 'task-2'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.events).toHaveLength(2)
      expect(result.iterationGroups[1]?.events).toHaveLength(1)
    })

    it('startedAt of each group matches task-assigned event timestamp', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        taskAssigned(T2, 'task-2'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.startedAt).toStrictEqual(T0)
      expect(result.iterationGroups[1]?.startedAt).toStrictEqual(T2)
    })

    it('endedAt of completed groups is the last event timestamp', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        planApproval(T1),
        taskAssigned(T2, 'task-2'),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.endedAt).toStrictEqual(T1)
    })

    it('last group has no endedAt', () => {
      const events = [
        taskAssigned(T0, 'task-1'),
        planApproval(T1),
      ]
      const result = buildSessionViewData('sess-1', events)
      expect(result.iterationGroups[0]?.endedAt).toBeUndefined()
    })
  })
})


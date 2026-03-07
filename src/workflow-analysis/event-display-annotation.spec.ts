import type { WorkflowEvent, StateName } from '../workflow-definition/index.js'
import { annotateEventsWithState, annotateEventsWithIteration, annotateEvents } from './event-display.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'
const T3 = '2026-01-01T00:03:00.000Z'
const T4 = '2026-01-01T00:04:00.000Z'

function transition(at: string, from: StateName, to: StateName): WorkflowEvent {
  return { type: 'transitioned' as const, at, from, to }
}

function taskAssigned(at: string, task: string): WorkflowEvent {
  return { type: 'iteration-task-assigned' as const, at, task }
}

describe('annotateEventsWithState', () => {
  it('assigns idle state to events before any transition', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'session-started' as const, at: T0 },
    ]
    const result = annotateEventsWithState(events)
    expect(result[0]?.state).toStrictEqual('idle')
  })

  it('assigns state from most recent transitioned event', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'SPAWN', 'PLANNING'),
      { type: 'session-started' as const, at: T1 },
    ]
    const result = annotateEventsWithState(events)
    expect(result[1]?.state).toStrictEqual('PLANNING')
  })

  it('updates state as transitions occur', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'SPAWN', 'PLANNING'),
      transition(T1, 'PLANNING', 'RESPAWN'),
      { type: 'plan-approval-recorded' as const, at: T2 },
    ]
    const result = annotateEventsWithState(events)
    expect(result[0]?.state).toStrictEqual('idle')
    expect(result[1]?.state).toStrictEqual('PLANNING')
    expect(result[2]?.state).toStrictEqual('RESPAWN')
  })

  it('returns empty array for empty events', () => {
    expect(annotateEventsWithState([])).toStrictEqual([])
  })

  it('preserves original event in annotated result', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'issue-recorded' as const, at: T0, issueNumber: 42 },
    ]
    const result = annotateEventsWithState(events)
    expect(result[0]?.event).toStrictEqual(events[0])
  })
})

describe('annotateEventsWithIteration', () => {
  it('assigns iteration 0 to events before any task-assigned', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'SPAWN', 'PLANNING'),
      transition(T1, 'PLANNING', 'RESPAWN'),
    ]
    const result = annotateEventsWithIteration(events)
    expect(result[0]?.iteration).toStrictEqual(0)
    expect(result[1]?.iteration).toStrictEqual(0)
  })

  it('increments iteration on each task-assigned event', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T0, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      taskAssigned(T2, 'Task B'),
      transition(T3, 'RESPAWN', 'DEVELOPING'),
    ]
    const result = annotateEventsWithIteration(events)
    expect(result[0]?.iteration).toStrictEqual(1)
    expect(result[1]?.iteration).toStrictEqual(1)
    expect(result[2]?.iteration).toStrictEqual(2)
    expect(result[3]?.iteration).toStrictEqual(2)
  })

  it('returns empty array for empty events', () => {
    expect(annotateEventsWithIteration([])).toStrictEqual([])
  })

  it('preserves original event in annotated result', () => {
    const events: readonly WorkflowEvent[] = [taskAssigned(T0, 'Task A')]
    const result = annotateEventsWithIteration(events)
    expect(result[0]?.event).toStrictEqual(events[0])
  })

  it('assigns pre-iteration events iteration 0 and post-iteration events keep last iteration', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'SPAWN', 'PLANNING'),
      taskAssigned(T1, 'Task A'),
      transition(T2, 'DEVELOPING', 'REVIEWING'),
      { type: 'review-approved' as const, at: T3 },
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const result = annotateEventsWithIteration(events)
    expect(result[0]?.iteration).toStrictEqual(0)
    expect(result[1]?.iteration).toStrictEqual(1)
    expect(result[4]?.iteration).toStrictEqual(1)
  })
})

describe('annotateEvents', () => {
  it('populates both state and iteration for each event', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'SPAWN', 'PLANNING'),
      taskAssigned(T1, 'Task A'),
      transition(T2, 'DEVELOPING', 'REVIEWING'),
      { type: 'review-approved' as const, at: T3 },
    ]
    const result = annotateEvents(events)
    expect(result).toStrictEqual([
      { event: events[0], state: 'idle', iteration: 0 },
      { event: events[1], state: 'PLANNING', iteration: 1 },
      { event: events[2], state: 'PLANNING', iteration: 1 },
      { event: events[3], state: 'REVIEWING', iteration: 1 },
    ])
  })

  it('returns empty array for empty events', () => {
    expect(annotateEvents([])).toStrictEqual([])
  })

  it('assigns idle state and iteration 0 before any transition or task', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'session-started' as const, at: T0 },
    ]
    const result = annotateEvents(events)
    expect(result[0]).toStrictEqual({ event: events[0], state: 'idle', iteration: 0 })
  })

  it('tracks multiple iterations with state changes', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T0, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      taskAssigned(T2, 'Task B'),
      transition(T3, 'RESPAWN', 'DEVELOPING'),
    ]
    const result = annotateEvents(events)
    expect(result[0]).toStrictEqual({ event: events[0], state: 'idle', iteration: 1 })
    expect(result[1]).toStrictEqual({ event: events[1], state: 'idle', iteration: 1 })
    expect(result[2]).toStrictEqual({ event: events[2], state: 'DEVELOPING', iteration: 2 })
    expect(result[3]).toStrictEqual({ event: events[3], state: 'DEVELOPING', iteration: 2 })
  })
})

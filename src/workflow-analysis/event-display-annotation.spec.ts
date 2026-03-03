import type { WorkflowEvent } from '../workflow-definition/index.js'
import { annotateEventsWithState, annotateEventsWithIteration } from './event-display.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'
const T3 = '2026-01-01T00:03:00.000Z'
const T4 = '2026-01-01T00:04:00.000Z'

function transition(at: string, from: string, to: string): WorkflowEvent {
  return { type: 'transitioned' as const, at, from, to }
}

function taskAssigned(at: string, task: string): WorkflowEvent {
  return { type: 'iteration-task-assigned' as const, at, task }
}

describe('annotateEventsWithState', () => {
  it('assigns idle state to events before any transition', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'session-started' as const, at: T0, sessionId: 'abc' },
    ]
    const result = annotateEventsWithState(events)
    expect(result[0]?.state).toStrictEqual('idle')
  })

  it('assigns state from most recent transitioned event', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'idle', 'SPAWN'),
      { type: 'session-started' as const, at: T1, sessionId: 'abc' },
    ]
    const result = annotateEventsWithState(events)
    expect(result[1]?.state).toStrictEqual('SPAWN')
  })

  it('updates state as transitions occur', () => {
    const events: readonly WorkflowEvent[] = [
      transition(T0, 'idle', 'SPAWN'),
      transition(T1, 'SPAWN', 'PLANNING'),
      { type: 'plan-approval-recorded' as const, at: T2 },
    ]
    const result = annotateEventsWithState(events)
    expect(result[0]?.state).toStrictEqual('idle')
    expect(result[1]?.state).toStrictEqual('SPAWN')
    expect(result[2]?.state).toStrictEqual('PLANNING')
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
      transition(T0, 'idle', 'SPAWN'),
      transition(T1, 'SPAWN', 'PLANNING'),
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
      transition(T0, 'idle', 'SPAWN'),
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

import type { WorkflowEvent, StateName } from '../workflow-definition/index.js'
import type { SessionSummary } from './workflow-analytics.js'
import type { SessionViewData, IterationGroup } from './session-view.js'
import { computeEnhancedSessionSummary } from './session-report.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'
const T3 = '2026-01-01T00:03:00.000Z'
const T4 = '2026-01-01T00:04:00.000Z'
const T5 = '2026-01-01T00:05:00.000Z'
const T6 = '2026-01-01T00:06:00.000Z'
const T7 = '2026-01-01T00:07:00.000Z'
const T8 = '2026-01-01T00:08:00.000Z'
const T9 = '2026-01-01T00:09:00.000Z'
const T10 = '2026-01-01T00:10:00.000Z'

function ms(minutes: number): number {
  return minutes * 60_000
}

function transition(at: string, from: StateName, to: StateName): WorkflowEvent {
  return { type: 'transitioned' as const, at, from, to }
}

function taskAssigned(at: string, task: string): WorkflowEvent {
  return { type: 'iteration-task-assigned' as const, at, task }
}

function reviewApproved(at: string): WorkflowEvent {
  return { type: 'review-approved' as const, at }
}

function reviewRejected(at: string): WorkflowEvent {
  return { type: 'review-rejected' as const, at }
}

function baseSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'sess-1',
    eventCount: 10,
    duration: '10m 0s',
    iterationCount: 1,
    stateDurations: {},
    reviewOutcomes: { approved: 1, rejected: 0 },
    blockedEpisodes: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    ...overrides,
  }
}

function iterGroup(index: number, task: string, events: readonly WorkflowEvent[], startedAt: string, endedAt?: string): IterationGroup {
  if (endedAt !== undefined) return { iterationIndex: index, task, events, startedAt, endedAt }
  return { iterationIndex: index, task, events, startedAt }
}

function baseViewData(overrides: Partial<SessionViewData> = {}): SessionViewData {
  return {
    sessionId: 'sess-1',
    startedAt: T0,
    currentState: 'COMPLETE',
    totalDurationMs: ms(10),
    statePeriods: [],
    iterationGroups: [],
    recentEvents: [],
    ...overrides,
  }
}

describe('computeEnhancedSessionSummary — multiple iterations', () => {
  const iter1Events: readonly WorkflowEvent[] = [
    taskAssigned(T1, 'Task A'),
    transition(T1, 'RESPAWN', 'DEVELOPING'),
    transition(T3, 'DEVELOPING', 'REVIEWING'),
    reviewApproved(T3),
    transition(T4, 'REVIEWING', 'COMMITTING'),
    transition(T4, 'COMMITTING', 'RESPAWN'),
  ]
  const iter2Events: readonly WorkflowEvent[] = [
    taskAssigned(T5, 'Task B'),
    transition(T5, 'RESPAWN', 'DEVELOPING'),
    transition(T7, 'DEVELOPING', 'REVIEWING'),
    reviewRejected(T7),
    reviewRejected(T8),
    transition(T8, 'REVIEWING', 'DEVELOPING'),
    transition(T9, 'DEVELOPING', 'REVIEWING'),
    reviewApproved(T9),
    transition(T10, 'REVIEWING', 'COMMITTING'),
  ]
  const viewData = baseViewData({
    totalDurationMs: ms(10),
    iterationGroups: [
      iterGroup(0, 'Task A', iter1Events, T1, T4),
      iterGroup(1, 'Task B', iter2Events, T5),
    ],
  })
  const allEvents = [...iter1Events, ...iter2Events]

  it('produces one IterationMetrics per iteration group', () => {
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 2 }), viewData, allEvents)
    expect(result.iterationMetrics).toHaveLength(2)
  })

  it('computes velocityTrend as iteration durations in order', () => {
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 2 }), viewData, allEvents)
    expect(result.velocityTrend).toStrictEqual([ms(4), ms(5)])
  })

  it('sets correct task for each iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 2 }), viewData, allEvents)
    expect(result.iterationMetrics[0]?.task).toStrictEqual('Task A')
    expect(result.iterationMetrics[1]?.task).toStrictEqual('Task B')
  })
})

describe('computeEnhancedSessionSummary — iteration duration edge cases', () => {
  it('returns zero duration when allEvents is empty for last iteration', () => {
    const events: readonly WorkflowEvent[] = [taskAssigned(T1, 'Task A')]
    const vd = baseViewData({
      totalDurationMs: 0,
      iterationGroups: [iterGroup(0, 'Task A', events, T1)],
    })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, [])
    expect(result.iterationMetrics[0]?.durationMs).toStrictEqual(0)
  })

  it('computes zero proportionOfSession when totalDurationMs is zero', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
    ]
    const vd = baseViewData({
      totalDurationMs: 0,
      iterationGroups: [iterGroup(0, 'Task A', events, T1)],
    })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.iterationMetrics[0]?.proportionOfSession).toStrictEqual(0)
  })

  it('handles rework transition as last event in iteration without error', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T3),
      transition(T4, 'REVIEWING', 'DEVELOPING'),
    ]
    const vd = baseViewData({
      totalDurationMs: ms(4),
      iterationGroups: [iterGroup(0, 'Task A', events, T1)],
    })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.reworkTimeMs).toStrictEqual(0)
  })
})

describe('computeEnhancedSessionSummary — rework analysis', () => {
  it('computes 100% firstPassApprovalRate when all iterations approved first pass', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T3),
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(4), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.firstPassApprovalRate).toStrictEqual(1)
  })

  it('computes 0% firstPassApprovalRate when no iterations approved first pass', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T3),
      transition(T4, 'REVIEWING', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T5),
      transition(T6, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(6), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.firstPassApprovalRate).toStrictEqual(0)
  })

  it('computes totalRejections across all iterations', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T3),
      transition(T4, 'REVIEWING', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T5),
      transition(T6, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(6), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary({ reviewOutcomes: { approved: 1, rejected: 1 } }), vd, events)
    expect(result.reworkAnalysis.totalRejections).toStrictEqual(1)
  })

  it('computes reworkTimeMs as DEVELOPING time after first REVIEWING→DEVELOPING per iteration', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T3),
      transition(T4, 'REVIEWING', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T5),
      transition(T6, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(6), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.reworkTimeMs).toStrictEqual(ms(1))
  })

  it('computes reworkProportion as reworkTimeMs / total duration', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T3),
      transition(T4, 'REVIEWING', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T5),
      transition(T6, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(6), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.reworkProportion).toStrictEqual(ms(1) / ms(6))
  })

  it('identifies worstIteration as the one with most rejections', () => {
    const iter1Events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T2, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T2),
      transition(T3, 'REVIEWING', 'COMMITTING'),
      transition(T3, 'COMMITTING', 'RESPAWN'),
    ]
    const iter2Events: readonly WorkflowEvent[] = [
      taskAssigned(T4, 'Task B'),
      transition(T4, 'RESPAWN', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T5),
      transition(T6, 'REVIEWING', 'DEVELOPING'),
      transition(T7, 'DEVELOPING', 'REVIEWING'),
      reviewRejected(T7),
      transition(T8, 'REVIEWING', 'DEVELOPING'),
      transition(T9, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T9),
      transition(T10, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({
      totalDurationMs: ms(10),
      iterationGroups: [iterGroup(0, 'Task A', iter1Events, T1, T3), iterGroup(1, 'Task B', iter2Events, T4)],
    })
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 2 }), vd, [...iter1Events, ...iter2Events])
    expect(result.reworkAnalysis.worstIteration).toStrictEqual(1)
  })

  it('returns undefined worstIteration when no rejections', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T3),
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(4), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.reworkAnalysis.worstIteration).toBeUndefined()
  })
})

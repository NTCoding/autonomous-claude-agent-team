import type { WorkflowEvent } from '../workflow-definition/index.js'
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

function ms(minutes: number): number {
  return minutes * 60_000
}

function transition(at: string, from: string, to: string): WorkflowEvent {
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

function writeDenied(at: string, filePath: string): WorkflowEvent {
  return { type: 'write-checked' as const, at, tool: 'Write', filePath, allowed: false, reason: 'outside scope' }
}

function bashDenied(at: string, command: string): WorkflowEvent {
  return { type: 'bash-checked' as const, at, tool: 'Bash', command, allowed: false, reason: 'blocked' }
}

function sessionStarted(at: string, _sessionId: string, transcriptPath?: string): WorkflowEvent {
  const base = { type: 'session-started' as const, at }
  if (transcriptPath !== undefined) return { ...base, transcriptPath }
  return base
}

function issueRecorded(at: string, issueNumber: number): WorkflowEvent {
  return { type: 'issue-recorded' as const, at, issueNumber }
}

function branchRecorded(at: string, branch: string): WorkflowEvent {
  return { type: 'branch-recorded' as const, at, branch }
}

function prCreated(at: string, prNumber: number): WorkflowEvent {
  return { type: 'pr-created' as const, at, prNumber }
}

function prRecorded(at: string, prNumber: number): WorkflowEvent {
  return { type: 'pr-recorded' as const, at, prNumber }
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

describe('computeEnhancedSessionSummary — metadata extraction', () => {
  it('extracts transcriptPath from session-started event', () => {
    const events: readonly WorkflowEvent[] = [sessionStarted(T0, 'sess-1', '/tmp/transcript.jsonl')]
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), events)
    expect(result.transcriptPath).toStrictEqual('/tmp/transcript.jsonl')
  })

  it('returns undefined transcriptPath when session-started has no transcriptPath', () => {
    const events: readonly WorkflowEvent[] = [sessionStarted(T0, 'sess-1')]
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), events)
    expect(result.transcriptPath).toBeUndefined()
  })

  it('extracts githubIssue from issue-recorded event', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [issueRecorded(T0, 42)])
    expect(result.githubIssue).toStrictEqual(42)
  })

  it('extracts featureBranch from branch-recorded event', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [branchRecorded(T0, 'feature/auth')])
    expect(result.featureBranch).toStrictEqual('feature/auth')
  })

  it('extracts prNumber from pr-created event', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [prCreated(T0, 99)])
    expect(result.prNumber).toStrictEqual(99)
  })

  it('extracts prNumber from pr-recorded event when no pr-created', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [prRecorded(T0, 77)])
    expect(result.prNumber).toStrictEqual(77)
  })

  it('prefers pr-created over pr-recorded when both exist', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [prRecorded(T0, 77), prCreated(T1, 99)])
    expect(result.prNumber).toStrictEqual(99)
  })

  it('returns undefined for all metadata when no relevant events exist', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [])
    expect(result.transcriptPath).toBeUndefined()
    expect(result.githubIssue).toBeUndefined()
    expect(result.featureBranch).toBeUndefined()
  })
})

describe('computeEnhancedSessionSummary — totalDenials', () => {
  it('sums all hook denial types from base summary', () => {
    const summary = baseSummary({ hookDenials: { write: 2, bash: 1, pluginRead: 0, idle: 1 } })
    const result = computeEnhancedSessionSummary(summary, baseViewData(), [])
    expect(result.totalDenials).toStrictEqual(4)
  })

  it('returns zero when no denials', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData(), [])
    expect(result.totalDenials).toStrictEqual(0)
  })
})

describe('computeEnhancedSessionSummary — single clean iteration', () => {
  const iterEvents: readonly WorkflowEvent[] = [
    taskAssigned(T1, 'Implement auth'),
    transition(T1, 'RESPAWN', 'DEVELOPING'),
    transition(T3, 'DEVELOPING', 'REVIEWING'),
    reviewApproved(T3),
    transition(T4, 'REVIEWING', 'COMMITTING'),
    transition(T5, 'COMMITTING', 'COMPLETE'),
  ]
  const viewData = baseViewData({
    totalDurationMs: ms(10),
    iterationGroups: [iterGroup(0, 'Implement auth', iterEvents, T1)],
  })
  const allEvents: readonly WorkflowEvent[] = [
    sessionStarted(T0, 'sess-1'),
    transition(T0, 'idle', 'SPAWN'),
    transition(T0, 'SPAWN', 'PLANNING'),
    transition(T1, 'PLANNING', 'RESPAWN'),
    ...iterEvents,
  ]

  it('computes iteration durationMs from task-assigned to session end', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.durationMs).toStrictEqual(ms(4))
  })

  it('computes devTimeMs from DEVELOPING state duration within iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.devTimeMs).toStrictEqual(ms(2))
  })

  it('computes reviewTimeMs from REVIEWING state duration within iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.reviewTimeMs).toStrictEqual(ms(1))
  })

  it('computes commitTimeMs from COMMITTING state duration within iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.commitTimeMs).toStrictEqual(ms(1))
  })

  it('returns zero respawnTimeMs when no respawn during iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.respawnTimeMs).toStrictEqual(0)
  })

  it('returns zero rejectionCount for clean iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.rejectionCount).toStrictEqual(0)
  })

  it('returns zero hookDenials for clean iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.hookDenials).toStrictEqual({ write: 0, bash: 0, pluginRead: 0, idle: 0 })
  })

  it('returns true firstPassApproval when first review is approved', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.firstPassApproval).toStrictEqual(true)
  })

  it('returns zero reworkCycles for clean iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.reworkCycles).toStrictEqual(0)
  })

  it('computes proportionOfSession as iteration duration / total duration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, allEvents)
    expect(result.iterationMetrics[0]?.proportionOfSession).toStrictEqual(ms(4) / ms(10))
  })
})

describe('computeEnhancedSessionSummary — rework iteration', () => {
  const iterEvents: readonly WorkflowEvent[] = [
    taskAssigned(T1, 'Fix bug'),
    transition(T1, 'RESPAWN', 'DEVELOPING'),
    writeDenied(T2, 'src/config.ts'),
    transition(T3, 'DEVELOPING', 'REVIEWING'),
    reviewRejected(T3),
    transition(T4, 'REVIEWING', 'DEVELOPING'),
    transition(T5, 'DEVELOPING', 'REVIEWING'),
    reviewApproved(T5),
    transition(T6, 'REVIEWING', 'COMMITTING'),
  ]
  const viewData = baseViewData({
    totalDurationMs: ms(10),
    iterationGroups: [iterGroup(0, 'Fix bug', iterEvents, T1, T6)],
  })

  it('counts rejections within iteration window', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.rejectionCount).toStrictEqual(1)
  })

  it('returns false firstPassApproval when first review event is rejected', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.firstPassApproval).toStrictEqual(false)
  })

  it('counts rework cycles as REVIEWING→DEVELOPING transitions', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.reworkCycles).toStrictEqual(1)
  })

  it('counts write hookDenials within iteration', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.hookDenials.write).toStrictEqual(1)
  })

  it('computes devTimeMs including rework developing time', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.devTimeMs).toStrictEqual(ms(3))
  })

  it('computes reviewTimeMs including both review periods', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), viewData, iterEvents)
    expect(result.iterationMetrics[0]?.reviewTimeMs).toStrictEqual(ms(2))
  })

  it('counts bash denials within iteration window', () => {
    const eventsWithBash: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      bashDenied(T2, 'rm -rf /'),
      bashDenied(T2, 'npm publish'),
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T3),
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(4), iterationGroups: [iterGroup(0, 'Task A', eventsWithBash, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, eventsWithBash)
    expect(result.iterationMetrics[0]?.hookDenials.bash).toStrictEqual(2)
  })

  it('computes respawnTimeMs when iteration includes RESPAWN state', () => {
    const eventsWithRespawn: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'COMMITTING', 'RESPAWN'),
      transition(T3, 'RESPAWN', 'DEVELOPING'),
      transition(T5, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T5),
      transition(T6, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(6), iterationGroups: [iterGroup(0, 'Task A', eventsWithRespawn, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, eventsWithRespawn)
    expect(result.iterationMetrics[0]?.respawnTimeMs).toStrictEqual(ms(2))
  })
})

describe('computeEnhancedSessionSummary — idle denials and plugin-read denials', () => {
  it('counts idle denials within iteration window', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      { type: 'idle-checked' as const, at: T2, agentName: 'dev', allowed: false, reason: 'not idle' },
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T3),
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(4), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.iterationMetrics[0]?.hookDenials.idle).toStrictEqual(1)
  })

  it('counts plugin-read denials within iteration window', () => {
    const events: readonly WorkflowEvent[] = [
      taskAssigned(T1, 'Task A'),
      transition(T1, 'RESPAWN', 'DEVELOPING'),
      { type: 'plugin-read-checked' as const, at: T2, tool: 'Read', path: '/etc/secret', allowed: false, reason: 'restricted' },
      transition(T3, 'DEVELOPING', 'REVIEWING'),
      reviewApproved(T3),
      transition(T4, 'REVIEWING', 'COMMITTING'),
    ]
    const vd = baseViewData({ totalDurationMs: ms(4), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.iterationMetrics[0]?.hookDenials.pluginRead).toStrictEqual(1)
  })
})

describe('computeEnhancedSessionSummary — edge cases', () => {
  it('handles empty events gracefully', () => {
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 0 }), baseViewData({ iterationGroups: [] }), [])
    expect(result.iterationMetrics).toStrictEqual([])
    expect(result.velocityTrend).toStrictEqual([])
    expect(result.totalDenials).toStrictEqual(0)
  })

  it('handles zero-duration session without division errors', () => {
    const result = computeEnhancedSessionSummary(baseSummary(), baseViewData({ totalDurationMs: 0 }), [])
    expect(result.reworkAnalysis.reworkProportion).toStrictEqual(0)
  })

  it('handles iteration with no review events', () => {
    const events: readonly WorkflowEvent[] = [taskAssigned(T1, 'Task A'), transition(T1, 'RESPAWN', 'DEVELOPING')]
    const vd = baseViewData({ totalDurationMs: ms(1), iterationGroups: [iterGroup(0, 'Task A', events, T1)] })
    const result = computeEnhancedSessionSummary(baseSummary(), vd, events)
    expect(result.iterationMetrics[0]?.firstPassApproval).toStrictEqual(true)
    expect(result.iterationMetrics[0]?.rejectionCount).toStrictEqual(0)
  })

  it('preserves all base SessionSummary fields', () => {
    const summary = baseSummary({ sessionId: 'test-123', eventCount: 42 })
    const result = computeEnhancedSessionSummary(summary, baseViewData(), [])
    expect(result.sessionId).toStrictEqual('test-123')
    expect(result.eventCount).toStrictEqual(42)
  })

  it('handles firstPassApprovalRate with zero iterations', () => {
    const result = computeEnhancedSessionSummary(baseSummary({ iterationCount: 0 }), baseViewData({ iterationGroups: [] }), [])
    expect(result.reworkAnalysis.firstPassApprovalRate).toStrictEqual(1)
  })
})

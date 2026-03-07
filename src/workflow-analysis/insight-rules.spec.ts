import type { EnhancedSessionSummary, IterationMetrics } from './session-report.js'
import { evaluateInsightRules } from './insight-rules.js'
import type { Insight } from './insight-rules.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'

function ms(minutes: number): number {
  return minutes * 60_000
}

function baseIteration(overrides: Partial<IterationMetrics> = {}): IterationMetrics {
  return {
    iterationIndex: 0,
    task: 'Task A',
    durationMs: ms(5),
    devTimeMs: ms(3),
    reviewTimeMs: ms(1),
    commitTimeMs: ms(1),
    respawnTimeMs: 0,
    rejectionCount: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    firstPassApproval: true,
    reworkCycles: 0,
    proportionOfSession: 0.5,
    ...overrides,
  }
}

function baseSummary(overrides: Partial<EnhancedSessionSummary> = {}): EnhancedSessionSummary {
  return {
    sessionId: 'sess-1',
    eventCount: 20,
    duration: '10m 0s',
    iterationCount: 2,
    stateDurations: { DEVELOPING: ms(5), REVIEWING: ms(3), COMMITTING: ms(2) },
    reviewOutcomes: { approved: 2, rejected: 0 },
    blockedEpisodes: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    iterationMetrics: [baseIteration({ iterationIndex: 0 }), baseIteration({ iterationIndex: 1 })],
    reworkAnalysis: { totalRejections: 0, firstPassApprovalRate: 1, reworkTimeMs: 0, reworkProportion: 0, worstIteration: undefined },
    totalDenials: 0,
    velocityTrend: [ms(5), ms(5)],
    transcriptPath: '/tmp/transcript.jsonl',
    repository: 'owner/repo',
    githubIssue: 42,
    featureBranch: 'feature/x',
    prNumber: 99,
    ...overrides,
  }
}

describe('rework-dominated-iteration insight', () => {
  it('fires warning when iteration has rejectionCount >= 2', () => {
    const summary = baseSummary({
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, rejectionCount: 3, task: 'Auth flow', proportionOfSession: 0.7, durationMs: ms(7) }),
        baseIteration({ iterationIndex: 1 }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const reworkInsight = insights.find((i) => i.title.includes('review rejections'))
    expect(reworkInsight?.severity).toStrictEqual('warning')
    expect(reworkInsight?.title).toContain('3 review rejections')
  })

  it('formats sub-minute durations in evidence', () => {
    const summary = baseSummary({
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, rejectionCount: 2, task: 'Quick', durationMs: 30_000, proportionOfSession: 0.5 }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const reworkInsight = insights.find((i) => i.title.includes('review rejections'))
    expect(reworkInsight?.evidence).toContain('30s')
  })

  it('does not fire when rejectionCount < 2', () => {
    const summary = baseSummary({
      iterationMetrics: [baseIteration({ rejectionCount: 1 })],
    })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('review rejections'))).toBeUndefined()
  })

  it('omits prompt when transcriptPath is undefined', () => {
    const summary = baseSummary({
      transcriptPath: undefined,
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, rejectionCount: 2, task: 'Auth flow' }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const reworkInsight = insights.find((i) => i.title.includes('review rejections'))
    expect(reworkInsight?.prompt).toBeUndefined()
  })

  it('includes task name and iteration index in evidence', () => {
    const summary = baseSummary({
      iterationMetrics: [
        baseIteration({ iterationIndex: 2, rejectionCount: 2, task: 'Fix auth' }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const reworkInsight = insights.find((i) => i.title.includes('review rejections'))
    expect(reworkInsight?.evidence).toContain('Fix auth')
    expect(reworkInsight?.evidence).toContain('Iteration 2')
  })
})

describe('hook-denial-cluster insight', () => {
  it('fires warning when totalDenials >= 3 and >60% in one state', () => {
    const events: WorkflowEvent[] = [
      { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'RESPAWN', to: 'REVIEWING' },
      { type: 'bash-checked' as const, at: '2026-01-01T00:00:30.000Z', tool: 'Bash', command: 'rm x', allowed: false },
      { type: 'transitioned' as const, at: '2026-01-01T00:01:00.000Z', from: 'REVIEWING', to: 'DEVELOPING' },
      { type: 'write-checked' as const, at: '2026-01-01T00:02:00.000Z', tool: 'Write', filePath: 'a.ts', allowed: false },
      { type: 'write-checked' as const, at: '2026-01-01T00:03:00.000Z', tool: 'Write', filePath: 'b.ts', allowed: false },
    ]
    const summary = baseSummary({ totalDenials: 3, hookDenials: { write: 2, bash: 1, pluginRead: 0, idle: 0 } })
    const insights = evaluateInsightRules(summary, events)
    const clusterInsight = insights.find((i) => i.title.includes('hook denials'))
    expect(clusterInsight?.severity).toStrictEqual('warning')
  })

  it('does not fire when denials >= 3 but spread across states below 60% threshold', () => {
    const events: WorkflowEvent[] = [
      { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'RESPAWN', to: 'DEVELOPING' },
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'a.ts', allowed: false },
      { type: 'transitioned' as const, at: '2026-01-01T00:02:00.000Z', from: 'DEVELOPING', to: 'REVIEWING' },
      { type: 'write-checked' as const, at: '2026-01-01T00:03:00.000Z', tool: 'Write', filePath: 'b.ts', allowed: false },
      { type: 'transitioned' as const, at: '2026-01-01T00:04:00.000Z', from: 'REVIEWING', to: 'COMMITTING' },
      { type: 'bash-checked' as const, at: '2026-01-01T00:05:00.000Z', tool: 'Bash', command: 'rm x', allowed: false },
    ]
    const summary = baseSummary({ totalDenials: 3, hookDenials: { write: 2, bash: 1, pluginRead: 0, idle: 0 } })
    const insights = evaluateInsightRules(summary, events)
    expect(insights.find((i) => i.title.includes('hook denials'))).toBeUndefined()
  })

  it('does not fire when events contain no denial events despite totalDenials >= 3', () => {
    const summary = baseSummary({ totalDenials: 3, hookDenials: { write: 2, bash: 1, pluginRead: 0, idle: 0 } })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('hook denials'))).toBeUndefined()
  })

  it('does not fire when totalDenials < 3', () => {
    const summary = baseSummary({ totalDenials: 2 })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('hook denials'))).toBeUndefined()
  })
})

describe('iteration-velocity-anomaly insight', () => {
  it('fires info when iteration > 2x median duration', () => {
    const summary = baseSummary({
      velocityTrend: [ms(3), ms(3), ms(10)],
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, durationMs: ms(3) }),
        baseIteration({ iterationIndex: 1, durationMs: ms(3) }),
        baseIteration({ iterationIndex: 2, durationMs: ms(10), task: 'Slow task' }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const velocityInsight = insights.find((i) => i.title.includes('velocity'))
    expect(velocityInsight?.severity).toStrictEqual('info')
  })

  it('does not fire when all iterations within 2x median', () => {
    const summary = baseSummary({ velocityTrend: [ms(3), ms(4), ms(5)] })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('velocity'))).toBeUndefined()
  })

  it('picks the slowest when multiple iterations exceed 2x median', () => {
    const summary = baseSummary({
      velocityTrend: [ms(1), ms(1), ms(1), ms(1), ms(5), ms(8), ms(6)],
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, durationMs: ms(1) }),
        baseIteration({ iterationIndex: 1, durationMs: ms(1) }),
        baseIteration({ iterationIndex: 2, durationMs: ms(1) }),
        baseIteration({ iterationIndex: 3, durationMs: ms(1) }),
        baseIteration({ iterationIndex: 4, durationMs: ms(5), task: 'Slow' }),
        baseIteration({ iterationIndex: 5, durationMs: ms(8), task: 'Slowest' }),
        baseIteration({ iterationIndex: 6, durationMs: ms(6), task: 'Medium slow' }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    const velocityInsight = insights.find((i) => i.title.includes('velocity'))
    expect(velocityInsight?.title).toContain('iteration 5')
  })

  it('does not fire when medianDuration is 0', () => {
    const summary = baseSummary({
      velocityTrend: [0, 0, 0],
      iterationMetrics: [
        baseIteration({ iterationIndex: 0, durationMs: 0 }),
        baseIteration({ iterationIndex: 1, durationMs: 0 }),
        baseIteration({ iterationIndex: 2, durationMs: 0 }),
      ],
    })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('velocity'))).toBeUndefined()
  })

  it('does not fire with fewer than 2 iterations', () => {
    const summary = baseSummary({
      velocityTrend: [ms(10)],
      iterationMetrics: [baseIteration()],
    })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('velocity'))).toBeUndefined()
  })
})

describe('session-completed-clean insight', () => {
  it('fires success when session reached COMPLETE state', () => {
    const summary = baseSummary({ stateDurations: { COMPLETE: ms(1), DEVELOPING: ms(5) } })
    const insights = evaluateInsightRules(summary, [])
    const completeInsight = insights.find((i) => i.title.includes('completed'))
    expect(completeInsight?.severity).toStrictEqual('success')
    expect(completeInsight?.title).toContain('PR #99')
  })

  it('omits PR text when prNumber is undefined', () => {
    const summary = baseSummary({ stateDurations: { COMPLETE: ms(1), DEVELOPING: ms(5) }, prNumber: undefined })
    const insights = evaluateInsightRules(summary, [])
    const completeInsight = insights.find((i) => i.title.includes('completed'))
    expect(completeInsight?.title).not.toContain('PR')
  })

  it('does not fire when session did not reach COMPLETE', () => {
    const summary = baseSummary({ stateDurations: { DEVELOPING: ms(5) } })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('completed'))).toBeUndefined()
  })
})

describe('session-blocked insight', () => {
  it('fires warning when blockedEpisodes >= 1', () => {
    const summary = baseSummary({ blockedEpisodes: 2 })
    const insights = evaluateInsightRules(summary, [])
    const blockedInsight = insights.find((i) => i.title.includes('blocked'))
    expect(blockedInsight?.severity).toStrictEqual('warning')
    expect(blockedInsight?.title).toContain('2 time(s)')
  })

  it('does not fire when blockedEpisodes is 0', () => {
    const summary = baseSummary({ blockedEpisodes: 0 })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('blocked'))).toBeUndefined()
  })
})

describe('zero-denials insight', () => {
  it('fires success when totalDenials is 0 and iterationCount >= 2', () => {
    const summary = baseSummary({ totalDenials: 0, iterationCount: 3 })
    const insights = evaluateInsightRules(summary, [])
    const zeroDenials = insights.find((i) => i.title.includes('Zero hook denials'))
    expect(zeroDenials?.severity).toStrictEqual('success')
  })

  it('does not fire when totalDenials > 0', () => {
    const summary = baseSummary({ totalDenials: 1, iterationCount: 2 })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('Zero hook denials'))).toBeUndefined()
  })

  it('does not fire when iterationCount < 2', () => {
    const summary = baseSummary({ totalDenials: 0, iterationCount: 1 })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('Zero hook denials'))).toBeUndefined()
  })
})

describe('high-respawn-overhead insight', () => {
  it('fires info when RESPAWN > 15% of session', () => {
    const summary = baseSummary({
      stateDurations: { RESPAWN: ms(3), DEVELOPING: ms(7) },
    })
    const insights = evaluateInsightRules(summary, [])
    const respawnInsight = insights.find((i) => i.title.includes('RESPAWN'))
    expect(respawnInsight?.severity).toStrictEqual('info')
  })

  it('does not fire when stateDurations is empty', () => {
    const summary = baseSummary({ stateDurations: {} })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('RESPAWN'))).toBeUndefined()
  })

  it('does not fire when RESPAWN <= 15%', () => {
    const summary = baseSummary({
      stateDurations: { RESPAWN: ms(1), DEVELOPING: ms(9) },
    })
    const insights = evaluateInsightRules(summary, [])
    expect(insights.find((i) => i.title.includes('RESPAWN'))).toBeUndefined()
  })
})

describe('evaluateInsightRules ordering', () => {
  it('returns warnings before info before success', () => {
    const summary = baseSummary({
      blockedEpisodes: 1,
      stateDurations: { RESPAWN: ms(3), DEVELOPING: ms(5), COMPLETE: ms(1) },
      totalDenials: 0,
      iterationCount: 2,
    })
    const insights = evaluateInsightRules(summary, [])
    const severities = insights.map((i) => i.severity)
    const warningIdx = severities.indexOf('warning')
    const infoIdx = severities.indexOf('info')
    const successIdx = severities.indexOf('success')
    expect(warningIdx).toBeLessThan(infoIdx)
    expect(infoIdx).toBeLessThan(successIdx)
  })
})

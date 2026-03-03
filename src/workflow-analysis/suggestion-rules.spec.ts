import type { WorkflowEvent } from '../workflow-definition/index.js'
import type { EnhancedSessionSummary, IterationMetrics } from './session-report.js'
import { evaluateSuggestionRules } from './suggestion-rules.js'

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
    githubIssue: 42,
    featureBranch: 'feature/x',
    prNumber: 99,
    ...overrides,
  }
}

describe('expand-write-scope suggestion', () => {
  it('fires when write denials >= 2 and paths share a common prefix', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/config/a.ts', allowed: false, reason: 'scope' },
      { type: 'write-checked' as const, at: '2026-01-01T00:02:00.000Z', tool: 'Write', filePath: 'src/config/b.ts', allowed: false, reason: 'scope' },
    ]
    const summary = baseSummary({ hookDenials: { write: 2, bash: 0, pluginRead: 0, idle: 0 } })
    const suggestions = evaluateSuggestionRules(summary, events)
    const writeSugg = suggestions.find((s) => s.title.includes('write scope'))
    expect(writeSugg?.title).toContain('src/config')
  })

  it('does not fire when write denials < 2', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/a.ts', allowed: false, reason: 'scope' },
    ]
    const summary = baseSummary({ hookDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 } })
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('write scope'))).toBeUndefined()
  })

  it('does not fire when only one denied path in events despite write count >= 2', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/config/a.ts', allowed: false, reason: 'scope' },
    ]
    const summary = baseSummary({ hookDenials: { write: 2, bash: 0, pluginRead: 0, idle: 0 } })
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('write scope'))).toBeUndefined()
  })

  it('uses shortest path segments for common prefix detection', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/config/deep/a.ts', allowed: false, reason: 'scope' },
      { type: 'write-checked' as const, at: '2026-01-01T00:02:00.000Z', tool: 'Write', filePath: 'src/config/b.ts', allowed: false, reason: 'scope' },
    ]
    const summary = baseSummary({ hookDenials: { write: 2, bash: 0, pluginRead: 0, idle: 0 } })
    const suggestions = evaluateSuggestionRules(summary, events)
    const writeSugg = suggestions.find((s) => s.title.includes('write scope'))
    expect(writeSugg?.title).toContain('src/config')
  })

  it('does not fire when denied paths have no common prefix', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/a.ts', allowed: false, reason: 'scope' },
      { type: 'write-checked' as const, at: '2026-01-01T00:02:00.000Z', tool: 'Write', filePath: 'tests/b.ts', allowed: false, reason: 'scope' },
    ]
    const summary = baseSummary({ hookDenials: { write: 2, bash: 0, pluginRead: 0, idle: 0 } })
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('write scope'))).toBeUndefined()
  })
})

describe('detect-guardrail-conflicts-in-planning suggestion', () => {
  it('fires when denials in DEVELOPING correlate with review rejections', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'RESPAWN', to: 'DEVELOPING' },
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'a.ts', allowed: false, reason: 'scope' },
      { type: 'transitioned' as const, at: '2026-01-01T00:02:00.000Z', from: 'DEVELOPING', to: 'REVIEWING' },
      { type: 'review-rejected' as const, at: '2026-01-01T00:03:00.000Z' },
    ]
    const summary = baseSummary({ totalDenials: 1 })
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('guardrail conflicts'))).toBeDefined()
  })

  it('does not fire when no denials correlate with rejections', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'RESPAWN', to: 'DEVELOPING' },
      { type: 'transitioned' as const, at: '2026-01-01T00:02:00.000Z', from: 'DEVELOPING', to: 'REVIEWING' },
      { type: 'review-approved' as const, at: '2026-01-01T00:03:00.000Z' },
    ]
    const summary = baseSummary()
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('guardrail conflicts'))).toBeUndefined()
  })
})

describe('improve-issue-description suggestion', () => {
  it('fires when iteration has both denials and rejections', () => {
    const events: readonly WorkflowEvent[] = [
      { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'RESPAWN', to: 'DEVELOPING' },
      { type: 'write-checked' as const, at: '2026-01-01T00:01:00.000Z', tool: 'Write', filePath: 'src/config/retry.ts', allowed: false, reason: 'scope' },
      { type: 'transitioned' as const, at: '2026-01-01T00:02:00.000Z', from: 'DEVELOPING', to: 'REVIEWING' },
      { type: 'review-rejected' as const, at: '2026-01-01T00:03:00.000Z' },
    ]
    const summary = baseSummary({
      githubIssue: 42,
      iterationMetrics: [baseIteration({ rejectionCount: 1, hookDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 } })],
    })
    const suggestions = evaluateSuggestionRules(summary, events)
    expect(suggestions.find((s) => s.title.includes('Issue #42'))).toBeDefined()
  })

  it('does not fire when no iteration has both denials and rejections', () => {
    const summary = baseSummary({
      iterationMetrics: [baseIteration({ rejectionCount: 0, hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 } })],
    })
    const suggestions = evaluateSuggestionRules(summary, [])
    expect(suggestions.find((s) => s.title.includes('Issue'))).toBeUndefined()
  })

  it('does not fire when no github issue recorded', () => {
    const summary = baseSummary({
      githubIssue: undefined,
      iterationMetrics: [baseIteration({ rejectionCount: 1, hookDenials: { write: 1, bash: 0, pluginRead: 0, idle: 0 } })],
    })
    const suggestions = evaluateSuggestionRules(summary, [])
    expect(suggestions.find((s) => s.title.includes('Issue'))).toBeUndefined()
  })
})

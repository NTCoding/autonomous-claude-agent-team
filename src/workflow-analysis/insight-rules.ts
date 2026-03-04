import type { EnhancedSessionSummary, IterationMetrics } from './session-report.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'
import { annotateEventsWithState } from './event-display.js'

export type InsightSeverity = 'warning' | 'info' | 'success'

export type Insight = {
  severity: InsightSeverity
  title: string
  evidence: string
  prompt: string | undefined
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  /* v8 ignore next */
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  /* v8 ignore next */
  return sorted[mid] ?? 0
}

function reworkDominatedIteration(summary: EnhancedSessionSummary): readonly Insight[] {
  return summary.iterationMetrics
    .filter((m) => m.rejectionCount >= 2)
    .map((m) => ({
      severity: 'warning' as const,
      title: `⚠ ${m.rejectionCount} review rejections in iteration ${m.iterationIndex} — rework dominated the session`,
      evidence: `Task "${m.task}" required ${m.rejectionCount + 1} review cycles before approval. Iteration ${m.iterationIndex} consumed ${Math.round(m.proportionOfSession * 100)}% of session time (${formatDuration(m.durationMs)}) despite being 1 of ${summary.iterationMetrics.length} iterations.`,
      prompt: summary.transcriptPath === undefined
        ? undefined
        : `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\nRead the transcript at ${summary.transcriptPath} focusing on iteration ${m.iterationIndex}. The task "${m.task}" had ${m.rejectionCount} review rejections. Cross-reference the journal entries with the hook denial events. Is this a guardrail scope problem, a task decomposition problem, or both?`,
    }))
}

function isDenialEvent(event: WorkflowEvent): boolean {
  switch (event.type) {
    case 'write-checked':
    case 'bash-checked':
    case 'plugin-read-checked':
    case 'idle-checked':
      return !event.allowed
    default:
      return false
  }
}

function findDominantDenialState(events: readonly WorkflowEvent[]): { state: string; proportion: number } | undefined {
  const annotated = annotateEventsWithState(events)
  const denialStates = annotated
    .filter((a) => isDenialEvent(a.event))
    .map((a) => a.state)
  if (denialStates.length === 0) return undefined
  const counts = denialStates.reduce<Record<string, number>>(
    (acc, state) => ({ ...acc, [state]: (acc[state] ?? 0) + 1 }),
    {},
  )
  const entries = Object.entries(counts)
  const dominant = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))
  return { state: dominant[0], proportion: dominant[1] / denialStates.length }
}

function hookDenialCluster(summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]): Insight | undefined {
  if (summary.totalDenials < 3) return undefined
  const dominant = findDominantDenialState(events)
  if (dominant === undefined || dominant.proportion <= 0.6) return undefined
  return {
    severity: 'warning',
    title: `⚠ ${summary.totalDenials} hook denials clustered in ${dominant.state} — guardrail/task mismatch`,
    evidence: `${summary.hookDenials.write}× write denied, ${summary.hookDenials.bash}× bash denied. Majority during ${dominant.state} state.`,
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\n${summary.totalDenials} hook denials in ${dominant.state}. Should the write scope be expanded? What are the security trade-offs?`,
  }
}

function iterationVelocityAnomaly(summary: EnhancedSessionSummary): Insight | undefined {
  if (summary.velocityTrend.length < 2) return undefined
  const medianDuration = median(summary.velocityTrend)
  if (medianDuration === 0) return undefined
  const slowest = summary.iterationMetrics.reduce<IterationMetrics | undefined>(
    (worst, m) => {
      const ratio = m.durationMs / medianDuration
      if (ratio <= 2) return worst
      if (worst === undefined) return m
      return m.durationMs > worst.durationMs ? m : worst
    },
    undefined,
  )
  if (slowest === undefined) return undefined
  const ratio = Math.round((slowest.durationMs / medianDuration) * 10) / 10
  return {
    severity: 'info',
    title: `ℹ Iteration velocity: iteration ${slowest.iterationIndex} was ${ratio}× slower`,
    evidence: `Median iteration: ${formatDuration(medianDuration)}. Iteration ${slowest.iterationIndex}: ${formatDuration(slowest.durationMs)}.`,
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\nautonomous-claude-agent-team:analyze --all\n\nCompare iteration velocity for session ${summary.sessionId} against recent sessions. Is the pattern recurring?`,
  }
}

function sessionCompletedClean(summary: EnhancedSessionSummary): Insight | undefined {
  if (summary.stateDurations['COMPLETE'] === undefined) return undefined
  const prText = summary.prNumber === undefined ? '' : `, PR #${summary.prNumber} created`
  return {
    severity: 'success',
    title: `✓ Session completed — ${summary.iterationCount} iterations${prText}`,
    evidence: `First-pass approval rate: ${Math.round(summary.reworkAnalysis.firstPassApprovalRate * 100)}% (${summary.reviewOutcomes.approved}/${summary.reviewOutcomes.approved + summary.reviewOutcomes.rejected}). ${summary.totalDenials} hook denials. ${summary.blockedEpisodes} blocked episodes.`,
    prompt: undefined,
  }
}

function sessionBlocked(summary: EnhancedSessionSummary): Insight | undefined {
  if (summary.blockedEpisodes < 1) return undefined
  return {
    severity: 'warning',
    title: `⚠ Session blocked ${summary.blockedEpisodes} time(s) — required human intervention`,
    evidence: `Blocked ${summary.blockedEpisodes} time(s) during session.`,
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\nSession was blocked ${summary.blockedEpisodes} time(s). Read the events around each BLOCKED transition to understand what triggered the block. Can any of these be prevented by adjusting guardrails or planning?`,
  }
}

function zeroDenials(summary: EnhancedSessionSummary): Insight | undefined {
  if (summary.totalDenials !== 0 || summary.iterationCount < 2) return undefined
  return {
    severity: 'success',
    title: '✓ Zero hook denials — guardrails well-calibrated for this task',
    evidence: `${summary.iterationCount} iterations completed without a single guardrail violation. Agents stayed within permitted boundaries throughout.`,
    prompt: undefined,
  }
}

function highRespawnOverhead(summary: EnhancedSessionSummary): Insight | undefined {
  const respawnMs = summary.stateDurations['RESPAWN'] ?? 0
  const totalMs = Object.values(summary.stateDurations).reduce((sum, v) => sum + v, 0)
  if (totalMs === 0) return undefined
  const proportion = respawnMs / totalMs
  if (proportion <= 0.15) return undefined
  const percent = Math.round(proportion * 100)
  return {
    severity: 'info',
    title: `ℹ ${percent}% of session time in RESPAWN — agent spawn overhead is significant`,
    evidence: `${formatDuration(respawnMs)} spent in RESPAWN state.`,
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\n${percent}% of session time was spent in RESPAWN state. Is this typical? Are there ways to reduce agent spawn overhead?`,
  }
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { warning: 0, info: 1, success: 2 }

export function evaluateInsightRules(summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]): readonly Insight[] {
  const insights: readonly Insight[] = [
    ...reworkDominatedIteration(summary),
    hookDenialCluster(summary, events),
    iterationVelocityAnomaly(summary),
    sessionCompletedClean(summary),
    sessionBlocked(summary),
    zeroDenials(summary),
    highRespawnOverhead(summary),
  ].filter((i): i is Insight => i !== undefined)

  return [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

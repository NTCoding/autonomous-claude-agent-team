import type { SessionSummary } from './workflow-analytics.js'
import type { SessionViewData, IterationGroup } from './session-view.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'

export type IterationMetrics = {
  iterationIndex: number
  task: string
  durationMs: number
  devTimeMs: number
  reviewTimeMs: number
  commitTimeMs: number
  respawnTimeMs: number
  rejectionCount: number
  hookDenials: { write: number; bash: number; pluginRead: number; idle: number }
  firstPassApproval: boolean
  reworkCycles: number
  proportionOfSession: number
}

export type ReworkAnalysis = {
  totalRejections: number
  firstPassApprovalRate: number
  reworkTimeMs: number
  reworkProportion: number
  worstIteration: number | undefined
}

export type EnhancedSessionSummary = SessionSummary & {
  iterationMetrics: readonly IterationMetrics[]
  reworkAnalysis: ReworkAnalysis
  totalDenials: number
  velocityTrend: readonly number[]
  transcriptPath: string | undefined
  githubIssue: number | undefined
  featureBranch: string | undefined
  prNumber: number | undefined
}

type TransitionEvent = Extract<WorkflowEvent, { type: 'transitioned' }>

function isTransition(e: WorkflowEvent): e is TransitionEvent {
  return e.type === 'transitioned'
}

function extractTranscriptPath(events: readonly WorkflowEvent[]): string | undefined {
  const found = events.find((e) => e.type === 'session-started')
  if (found === undefined || found.type !== 'session-started') return undefined
  return found.transcriptPath
}

function extractGithubIssue(events: readonly WorkflowEvent[]): number | undefined {
  const found = events.find((e) => e.type === 'issue-recorded')
  if (found === undefined || found.type !== 'issue-recorded') return undefined
  return found.issueNumber
}

function extractFeatureBranch(events: readonly WorkflowEvent[]): string | undefined {
  const found = events.find((e) => e.type === 'branch-recorded')
  if (found === undefined || found.type !== 'branch-recorded') return undefined
  return found.branch
}

function extractPrNumber(events: readonly WorkflowEvent[]): number | undefined {
  const created = events.find((e) => e.type === 'pr-created')
  if (created !== undefined && created.type === 'pr-created') return created.prNumber
  const recorded = events.find((e) => e.type === 'pr-recorded')
  if (recorded !== undefined && recorded.type === 'pr-recorded') return recorded.prNumber
  return undefined
}

function computeTotalDenials(summary: SessionSummary): number {
  return summary.hookDenials.write + summary.hookDenials.bash + summary.hookDenials.pluginRead + summary.hookDenials.idle
}

type StateDurationMap = Record<string, number>

type TransitionPair = { state: string; durationMs: number }

function toTransitionPairs(transitions: readonly TransitionEvent[]): readonly TransitionPair[] {
  return transitions.reduce<readonly TransitionPair[]>((pairs, current, i) => {
    const next = transitions[i + 1]
    if (next === undefined) return pairs
    return [...pairs, {
      state: current.to,
      durationMs: new Date(next.at).getTime() - new Date(current.at).getTime(),
    }]
  }, [])
}

function computeStateDurationsForEvents(events: readonly WorkflowEvent[]): StateDurationMap {
  const pairs = toTransitionPairs(events.filter(isTransition))
  return pairs.reduce<StateDurationMap>(
    (durations, pair) => ({
      ...durations,
      [pair.state]: (durations[pair.state] ?? 0) + pair.durationMs,
    }),
    {},
  )
}

function countRejections(events: readonly WorkflowEvent[]): number {
  return events.filter((e) => e.type === 'review-rejected').length
}

function countHookDenials(events: readonly WorkflowEvent[]): IterationMetrics['hookDenials'] {
  return {
    write: events.filter((e) => e.type === 'write-checked' && !e.allowed).length,
    bash: events.filter((e) => e.type === 'bash-checked' && !e.allowed).length,
    pluginRead: events.filter((e) => e.type === 'plugin-read-checked' && !e.allowed).length,
    idle: events.filter((e) => e.type === 'idle-checked' && !e.allowed).length,
  }
}

function isFirstPassApproval(events: readonly WorkflowEvent[]): boolean {
  const firstReview = events.find((e) => e.type === 'review-approved' || e.type === 'review-rejected')
  if (firstReview === undefined) return true
  return firstReview.type === 'review-approved'
}

function countReworkCycles(events: readonly WorkflowEvent[]): number {
  return events.filter(isTransition).filter((t) => t.from === 'REVIEWING' && t.to === 'DEVELOPING').length
}

function computeIterationDuration(
  group: IterationGroup,
  allEvents: readonly WorkflowEvent[],
  allGroups: readonly IterationGroup[],
): number {
  const groupIndex = allGroups.indexOf(group)
  const nextGroup = allGroups[groupIndex + 1]

  if (nextGroup !== undefined) {
    return new Date(nextGroup.startedAt).getTime() - new Date(group.startedAt).getTime()
  }

  const lastEvent = allEvents.at(-1)
  if (lastEvent === undefined) return 0
  return new Date(lastEvent.at).getTime() - new Date(group.startedAt).getTime()
}

type ReworkAccum = { started: boolean; timeMs: number }

function computeReworkTimeForIteration(events: readonly WorkflowEvent[]): number {
  const transitions = events.filter(isTransition)
  const result = transitions.reduce<ReworkAccum>(
    (acc, current, i) => {
      const isReworkTrigger = current.from === 'REVIEWING' && current.to === 'DEVELOPING'
      const started = acc.started || isReworkTrigger
      if (!started || current.to !== 'DEVELOPING') return { ...acc, started }
      const next = transitions[i + 1]
      if (next === undefined) return { ...acc, started }
      return {
        started,
        timeMs: acc.timeMs + new Date(next.at).getTime() - new Date(current.at).getTime(),
      }
    },
    { started: false, timeMs: 0 },
  )
  return result.timeMs
}

function computeSingleIterationMetrics(
  group: IterationGroup,
  allEvents: readonly WorkflowEvent[],
  allGroups: readonly IterationGroup[],
  totalDurationMs: number,
): IterationMetrics {
  const groupEvents = group.events
  const stateDurations = computeStateDurationsForEvents(groupEvents)
  const durationMs = computeIterationDuration(group, allEvents, allGroups)

  return {
    iterationIndex: group.iterationIndex,
    task: group.task,
    durationMs,
    devTimeMs: stateDurations['DEVELOPING'] ?? 0,
    reviewTimeMs: stateDurations['REVIEWING'] ?? 0,
    commitTimeMs: stateDurations['COMMITTING'] ?? 0,
    respawnTimeMs: stateDurations['RESPAWN'] ?? 0,
    rejectionCount: countRejections(groupEvents),
    hookDenials: countHookDenials(groupEvents),
    firstPassApproval: isFirstPassApproval(groupEvents),
    reworkCycles: countReworkCycles(groupEvents),
    proportionOfSession: totalDurationMs > 0 ? durationMs / totalDurationMs : 0,
  }
}

function computeAllIterationMetrics(
  viewData: SessionViewData,
  events: readonly WorkflowEvent[],
): readonly IterationMetrics[] {
  const iterationGroups = viewData.iterationGroups.filter((g) => g.task !== '')
  return iterationGroups.map((group) =>
    computeSingleIterationMetrics(group, events, iterationGroups, viewData.totalDurationMs),
  )
}

function findWorstIteration(metrics: readonly IterationMetrics[]): number | undefined {
  const withRejections = metrics.filter((m) => m.rejectionCount > 0)
  if (withRejections.length === 0) return undefined
  return withRejections.reduce((worst, m) => (m.rejectionCount > worst.rejectionCount ? m : worst)).iterationIndex
}

function computeReworkAnalysis(
  iterationMetrics: readonly IterationMetrics[],
  viewData: SessionViewData,
): ReworkAnalysis {
  const totalRejections = iterationMetrics.reduce((sum, m) => sum + m.rejectionCount, 0)
  const firstPassCount = iterationMetrics.filter((m) => m.firstPassApproval).length
  const firstPassApprovalRate = iterationMetrics.length === 0 ? 1 : firstPassCount / iterationMetrics.length

  const iterationGroups = viewData.iterationGroups.filter((g) => g.task !== '')
  const reworkTimeMs = iterationGroups.reduce(
    (sum, group) => sum + computeReworkTimeForIteration(group.events),
    0,
  )

  const reworkProportion = viewData.totalDurationMs > 0 ? reworkTimeMs / viewData.totalDurationMs : 0

  return {
    totalRejections,
    firstPassApprovalRate,
    reworkTimeMs,
    reworkProportion,
    worstIteration: findWorstIteration(iterationMetrics),
  }
}

export function computeEnhancedSessionSummary(
  baseSummary: SessionSummary,
  viewData: SessionViewData,
  events: readonly WorkflowEvent[],
): EnhancedSessionSummary {
  const iterationMetrics = computeAllIterationMetrics(viewData, events)
  const reworkAnalysis = computeReworkAnalysis(iterationMetrics, viewData)

  return {
    ...baseSummary,
    iterationMetrics,
    reworkAnalysis,
    totalDenials: computeTotalDenials(baseSummary),
    velocityTrend: iterationMetrics.map((m) => m.durationMs),
    transcriptPath: extractTranscriptPath(events),
    githubIssue: extractGithubIssue(events),
    featureBranch: extractFeatureBranch(events),
    prNumber: extractPrNumber(events),
  }
}

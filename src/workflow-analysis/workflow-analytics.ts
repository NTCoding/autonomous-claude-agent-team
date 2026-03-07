import type { SqliteEventStore } from '@ntcoding/agentic-workflow-builder/event-store'
import type { BaseEvent } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowEvent } from '../workflow-definition/index.js'
import { applyEvents, WorkflowEventSchema } from '../workflow-definition/index.js'
import { WorkflowError } from '../workflow-definition/index.js'

export function renderBar(ratio: number, width = 40): string {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function parseEvents(rawEvents: readonly BaseEvent[]): readonly WorkflowEvent[] {
  return rawEvents.flatMap((e) => {
    const result = WorkflowEventSchema.safeParse(e)
    return result.success ? [result.data] : []
  })
}

type TransitionedEvent = Extract<WorkflowEvent, { type: 'transitioned' }>

export type SessionSummary = {
  sessionId: string
  eventCount: number
  duration: string
  iterationCount: number
  stateDurations: Record<string, number>
  reviewOutcomes: { approved: number; rejected: number }
  blockedEpisodes: number
  hookDenials: { write: number; bash: number; pluginRead: number; idle: number }
}

const TERMINAL_EVENT_TYPES = new Set(['agent-shut-down'])

function isInProgress(events: readonly BaseEvent[]): boolean {
  const last = events.at(-1)
  if (last === undefined) return true
  if (events.some((e) => TERMINAL_EVENT_TYPES.has(e.type))) return false
  return Date.now() - new Date(last.at).getTime() < 60_000
}

type StateDurationAccumulator = {
  durations: Record<string, number>
  currentState: string | undefined
  currentStateStart: number | undefined
}

function applyTransitionToDurations(
  acc: StateDurationAccumulator,
  transitioned: TransitionedEvent,
  at: number,
): StateDurationAccumulator {
  if (acc.currentState !== undefined && acc.currentStateStart !== undefined) {
    const elapsed = at - acc.currentStateStart
    return {
      durations: {
        ...acc.durations,
        [acc.currentState]: (acc.durations[acc.currentState] ?? 0) + elapsed,
      },
      currentState: transitioned.to,
      currentStateStart: at,
    }
  }
  return {
    durations: acc.durations,
    currentState: transitioned.to,
    currentStateStart: at,
  }
}

function computeStateDurations(events: readonly BaseEvent[]): Record<string, number> {
  const parsed = parseEvents(events)
  const initial: StateDurationAccumulator = {
    durations: {},
    currentState: undefined,
    currentStateStart: undefined,
  }

  const afterTransitions = parsed.reduce((acc, event) => {
    if (event.type !== 'transitioned') return acc
    return applyTransitionToDurations(acc, event, new Date(event.at).getTime())
  }, initial)

  const lastAt = events.at(-1)?.at
  if (
    afterTransitions.currentState !== undefined &&
    afterTransitions.currentStateStart !== undefined &&
    lastAt !== undefined
  ) {
    const elapsed = new Date(lastAt).getTime() - afterTransitions.currentStateStart
    const state = afterTransitions.currentState
    return {
      ...afterTransitions.durations,
      [state]: (afterTransitions.durations[state] ?? 0) + elapsed,
    }
  }

  return afterTransitions.durations
}

type TimestampRange = { min: number; max: number }

function reduceToTimestampRange(events: readonly BaseEvent[]): TimestampRange {
  return events.reduce(
    (acc: TimestampRange, e: BaseEvent) => {
      const ts = new Date(e.at).getTime()
      return { min: Math.min(acc.min, ts), max: Math.max(acc.max, ts) }
    },
    { min: Infinity, max: -Infinity },
  )
}

function computeDuration(events: readonly BaseEvent[]): string {
  if (isInProgress(events)) return '(in progress)'
  const range = reduceToTimestampRange(events)
  return formatDuration(range.max - range.min)
}

export function computeSessionSummary(store: SqliteEventStore, sessionId: string): SessionSummary {
  const events = store.readEvents(sessionId)
  const parsed = parseEvents(events)

  const duration = computeDuration(events)
  const iterationCount = parsed.filter((e) => e.type === 'iteration-task-assigned').length
  const stateDurations = computeStateDurations(events)

  const reviewOutcomes = {
    approved: parsed.filter((e) => e.type === 'review-approved').length,
    rejected: parsed.filter((e) => e.type === 'review-rejected').length,
  }

  const blockedEpisodes = parsed.filter((e) => e.type === 'transitioned' && e.to === 'BLOCKED').length

  const hookDenials = {
    write: parsed.filter((e) => e.type === 'write-checked' && !e.allowed).length,
    bash: parsed.filter((e) => e.type === 'bash-checked' && !e.allowed).length,
    pluginRead: parsed.filter((e) => e.type === 'plugin-read-checked' && !e.allowed).length,
    idle: parsed.filter((e) => e.type === 'idle-checked' && !e.allowed).length,
  }

  return {
    sessionId,
    eventCount: events.length,
    duration,
    iterationCount,
    stateDurations,
    reviewOutcomes,
    blockedEpisodes,
    hookDenials,
  }
}

export type CrossSessionSummary = {
  totalSessions: number
  averageDuration: string
  averageIterations: number
  totalEvents: number
  hookHotspots: Array<{ type: string; count: number }>
}

function computeSessionDurationMs(store: SqliteEventStore, sessionId: string): number {
  const range = reduceToTimestampRange(store.readEvents(sessionId))
  return range.max - range.min
}

export function computeCrossSessionSummary(store: SqliteEventStore): CrossSessionSummary {
  const sessions = store.listSessions()
  const summaries = sessions.map((sessionId) => computeSessionSummary(store, sessionId))

  const totalSessions = summaries.length
  const completedSummaries = summaries.filter((s) => s.duration !== '(in progress)')

  const averageDuration =
    completedSummaries.length === 0
      ? '(in progress)'
      : formatDuration(
          completedSummaries.reduce(
            (sum, s) => sum + computeSessionDurationMs(store, s.sessionId),
            0,
          ) / completedSummaries.length,
        )

  const averageIterations =
    totalSessions === 0
      ? 0
      : summaries.reduce((sum, s) => sum + s.iterationCount, 0) / totalSessions

  const totalEvents = summaries.reduce((sum, s) => sum + s.eventCount, 0)

  const hookTotals: Record<string, number> = {
    'write-checked': summaries.reduce((sum, s) => sum + s.hookDenials.write, 0),
    'bash-checked': summaries.reduce((sum, s) => sum + s.hookDenials.bash, 0),
    'plugin-read-checked': summaries.reduce((sum, s) => sum + s.hookDenials.pluginRead, 0),
    'idle-checked': summaries.reduce((sum, s) => sum + s.hookDenials.idle, 0),
  }

  const hookHotspots = Object.entries(hookTotals)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalSessions,
    averageDuration,
    averageIterations,
    totalEvents,
    hookHotspots,
  }
}

export function formatSessionSummary(summary: SessionSummary): string {
  const stateDurationsEntries = Object.entries(summary.stateDurations)
  const totalMs = stateDurationsEntries.reduce((sum, [, ms]) => sum + ms, 0)

  const stateDurationLines =
    stateDurationsEntries.length === 0
      ? []
      : [
          '',
          'State Durations:',
          ...stateDurationsEntries.map(([state, ms]) => {
            const ratio = totalMs > 0 ? ms / totalMs : 0
            const pct = Math.round(ratio * 100)
            const bar = renderBar(ratio)
            const dur = formatDuration(ms)
            return `  ${state.padEnd(10)} ${bar}  ${String(pct).padStart(2)}%  (${dur})`
          }),
        ]

  return [
    `Session: ${summary.sessionId}`,
    '═══════════════════════════════════',
    '',
    `Duration:    ${summary.duration}`,
    `Events:      ${summary.eventCount}`,
    `Iterations:  ${summary.iterationCount}`,
    ...stateDurationLines,
    '',
    'Review Outcomes:',
    `  Approved:  ${summary.reviewOutcomes.approved}`,
    `  Rejected:  ${summary.reviewOutcomes.rejected}`,
    '',
    'Hook Denials:',
    `  write-checked:       ${summary.hookDenials.write}`,
    `  bash-checked:        ${summary.hookDenials.bash}`,
    `  plugin-read-checked: ${summary.hookDenials.pluginRead}`,
    `  idle-checked:        ${summary.hookDenials.idle}`,
    '',
    `Blocked Episodes: ${summary.blockedEpisodes}`,
  ].join('\n')
}

export function computeEventContext(store: SqliteEventStore, sessionId: string): string {
  const events = store.readEvents(sessionId)
  const workflowEvents = events.map((e) => {
    const result = WorkflowEventSchema.safeParse(e)
    if (!result.success) {
      throw new WorkflowError(`Unknown event type in store: "${e.type}". Event store may be corrupted or from a newer version.`)
    }
    return result.data
  })
  const state = applyEvents(workflowEvents)
  const lines: string[] = [
    `Session: ${sessionId}`,
    `State: ${state.currentStateMachineState} (iteration: ${state.iteration})`,
  ]
  if (state.activeAgents.length > 0) {
    lines.push(`Active agents: ${state.activeAgents.join(', ')}`)
  }
  if (state.iterations.length > 0) {
    lines.push('')
    lines.push('Iterations:')
    state.iterations.forEach((iter, i) => {
      lines.push(`  [${i}] ${iter.task}`)
    })
  }
  const recentEvents = [...events].reverse().slice(0, 15)
  if (recentEvents.length > 0) {
    lines.push('')
    lines.push(`Recent events (${recentEvents.length}):`)
    recentEvents.forEach((e) => {
      lines.push(`  ${e.at} ${e.type}`)
    })
  }
  return lines.join('\n')
}

export function formatCrossSessionSummary(summary: CrossSessionSummary): string {
  const hotspotLines =
    summary.hookHotspots.length === 0
      ? []
      : [
          '',
          'Hook Denial Hotspots:',
          ...summary.hookHotspots.map(({ type, count }) => `  ${type.padEnd(22)} ${count}`),
        ]

  return [
    `Total Sessions:      ${summary.totalSessions}`,
    `Average Duration:    ${summary.averageDuration}`,
    `Average Iterations:  ${summary.averageIterations.toFixed(1)}`,
    `Total Events:        ${summary.totalEvents}`,
    ...hotspotLines,
  ].join('\n')
}

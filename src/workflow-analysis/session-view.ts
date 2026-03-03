import type { BaseEvent } from '../workflow-engine/index.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'
import { WorkflowEventSchema } from '../workflow-definition/index.js'

export type IterationGroup = {
  iterationIndex: number
  task: string
  events: readonly WorkflowEvent[]
  startedAt: string
  endedAt?: string | undefined
}

export type StatePeriod = {
  state: string
  startedAt: string
  endedAt?: string | undefined
  durationMs: number
  proportionOfTotal: number
}

export type SessionViewData = {
  sessionId: string
  startedAt: string
  endedAt?: string | undefined
  currentState: string
  totalDurationMs: number
  statePeriods: readonly StatePeriod[]
  iterationGroups: readonly IterationGroup[]
  recentEvents: readonly WorkflowEvent[]
}

export type SessionListItem = {
  sessionId: string
  startedAt: string
  endedAt?: string | undefined
  durationMs: number
  iterationCount: number
  currentState: string
}

type Transitioned = Extract<WorkflowEvent, { type: 'transitioned' }>
type IterationTaskAssigned = Extract<WorkflowEvent, { type: 'iteration-task-assigned' }>

const DEFAULT_STATE = 'idle'
const RECENT_EVENT_COUNT = 20

function parseWorkflowEvents(events: readonly BaseEvent[]): readonly WorkflowEvent[] {
  return events.flatMap((e) => {
    const result = WorkflowEventSchema.safeParse(e)
    return result.success ? [result.data] : []
  })
}

function firstEventAt(events: readonly WorkflowEvent[]): string {
  return events.slice(0, 1).reduce((_acc, e) => e.at, '')
}

function lastEventAt(events: readonly WorkflowEvent[]): string {
  return events.reduce((_acc, e) => e.at, '')
}

function isTransitioned(e: WorkflowEvent): e is Transitioned {
  return e.type === 'transitioned'
}

function isIterationTaskAssigned(e: WorkflowEvent): e is IterationTaskAssigned {
  return e.type === 'iteration-task-assigned'
}

function extractCurrentState(events: readonly WorkflowEvent[]): string {
  const transitions = events.filter(isTransitioned)
  return transitions.reduce((_acc: string, e: Transitioned) => e.to, DEFAULT_STATE)
}

function extractSessionEndedAt(events: readonly WorkflowEvent[]): string | undefined {
  const completedTransition = events.find(
    (e): e is Transitioned => isTransitioned(e) && e.to === 'COMPLETE'
  )
  return completedTransition?.at
}

function makePeriod(
  state: string,
  startedAt: string,
  endedAt: string | undefined,
  durationMs: number
): StatePeriod {
  if (endedAt !== undefined) {
    return { state, startedAt, endedAt, durationMs, proportionOfTotal: 0 }
  }
  return { state, startedAt, durationMs, proportionOfTotal: 0 }
}

type PeriodAccum = {
  periods: StatePeriod[]
  currentState: string
  currentStartedAt: string
}

function reduceTransitions(
  accum: PeriodAccum,
  event: Transitioned
): PeriodAccum {
  const durationMs = new Date(event.at).getTime() - new Date(accum.currentStartedAt).getTime()
  const period = makePeriod(accum.currentState, accum.currentStartedAt, event.at, durationMs)
  return {
    periods: [...accum.periods, period],
    currentState: event.to,
    currentStartedAt: event.at,
  }
}

function withProportions(periods: StatePeriod[], totalDurationMs: number): readonly StatePeriod[] {
  if (totalDurationMs === 0) return periods
  return periods.map((p) => ({ ...p, proportionOfTotal: p.durationMs / totalDurationMs }))
}

function computeStatePeriods(events: readonly WorkflowEvent[], totalDurationMs: number): readonly StatePeriod[] {
  const start = firstEventAt(events)
  const transitions = events.filter(isTransitioned)
  const sessionEnd = extractSessionEndedAt(events)

  const initial: PeriodAccum = {
    periods: [],
    currentState: DEFAULT_STATE,
    currentStartedAt: start,
  }

  const { periods: rawPeriods, currentState, currentStartedAt } = transitions.reduce(
    reduceTransitions,
    initial
  )

  const lastAt = lastEventAt(events)
  const finalDurationMs = sessionEnd
    ? new Date(sessionEnd).getTime() - new Date(currentStartedAt).getTime()
    : totalDurationMs > 0
      ? new Date(lastAt).getTime() - new Date(currentStartedAt).getTime()
      : 0

  const finalPeriod = makePeriod(currentState, currentStartedAt, sessionEnd, finalDurationMs)
  const allPeriods = [...rawPeriods, finalPeriod]

  return withProportions(allPeriods, totalDurationMs)
}

type GroupAccum = {
  groups: IterationGroup[]
  iterationIndex: number
  currentTask: string
  currentEvents: WorkflowEvent[]
  currentStartedAt: string
}

function makeIterationGroup(
  iterationIndex: number,
  task: string,
  events: WorkflowEvent[],
  startedAt: string,
  endedAt: string | undefined
): IterationGroup {
  if (endedAt !== undefined) {
    return { iterationIndex, task, events, startedAt, endedAt }
  }
  return { iterationIndex, task, events, startedAt }
}

function reduceToIterationGroups(accum: GroupAccum, event: WorkflowEvent): GroupAccum {
  if (!isIterationTaskAssigned(event)) {
    return { ...accum, currentEvents: [...accum.currentEvents, event] }
  }

  if (accum.currentTask === '') {
    return {
      ...accum,
      currentTask: event.task,
      currentStartedAt: event.at,
      currentEvents: [...accum.currentEvents, event],
    }
  }

  const lastEvent = accum.currentEvents[accum.currentEvents.length - 1]
  const completedGroup = makeIterationGroup(
    accum.iterationIndex,
    accum.currentTask,
    accum.currentEvents,
    accum.currentStartedAt,
    lastEvent?.at
  )

  return {
    groups: [...accum.groups, completedGroup],
    iterationIndex: accum.iterationIndex + 1,
    currentTask: event.task,
    currentStartedAt: event.at,
    currentEvents: [event],
  }
}

function groupEventsByIteration(events: readonly WorkflowEvent[]): readonly IterationGroup[] {
  const start = firstEventAt(events)

  const initial: GroupAccum = {
    groups: [],
    iterationIndex: 0,
    currentTask: '',
    currentEvents: [],
    currentStartedAt: start,
  }

  const finalAccum = events.reduce(reduceToIterationGroups, initial)

  const lastGroup = makeIterationGroup(
    finalAccum.iterationIndex,
    finalAccum.currentTask,
    finalAccum.currentEvents,
    finalAccum.currentStartedAt,
    undefined
  )

  return [...finalAccum.groups, lastGroup]
}

function makeSessionViewData(
  sessionId: string,
  startedAt: string,
  endedAt: string | undefined,
  currentState: string,
  totalDurationMs: number,
  statePeriods: readonly StatePeriod[],
  iterationGroups: readonly IterationGroup[],
  recentEvents: readonly WorkflowEvent[]
): SessionViewData {
  if (endedAt !== undefined) {
    return { sessionId, startedAt, endedAt, currentState, totalDurationMs, statePeriods, iterationGroups, recentEvents }
  }
  return { sessionId, startedAt, currentState, totalDurationMs, statePeriods, iterationGroups, recentEvents }
}

export function buildSessionViewData(sessionId: string, events: readonly BaseEvent[]): SessionViewData {
  const parsed = parseWorkflowEvents(events)
  if (parsed.length === 0) {
    return {
      sessionId,
      startedAt: new Date(0).toISOString(),
      currentState: DEFAULT_STATE,
      totalDurationMs: 0,
      statePeriods: [],
      iterationGroups: [],
      recentEvents: [],
    }
  }

  const firstAt = firstEventAt(parsed)
  const endedAt = extractSessionEndedAt(parsed)
  const lastAt = lastEventAt(parsed)
  const totalDurationMs = new Date(lastAt).getTime() - new Date(firstAt).getTime()

  return makeSessionViewData(
    sessionId,
    firstAt,
    endedAt,
    extractCurrentState(parsed),
    totalDurationMs,
    computeStatePeriods(parsed, totalDurationMs),
    groupEventsByIteration(parsed),
    parsed.slice(-RECENT_EVENT_COUNT)
  )
}

export function buildSessionListItem(sessionId: string, events: readonly BaseEvent[]): SessionListItem {
  const parsed = parseWorkflowEvents(events)
  if (parsed.length === 0) {
    return {
      sessionId,
      startedAt: new Date(0).toISOString(),
      durationMs: 0,
      iterationCount: 0,
      currentState: DEFAULT_STATE,
    }
  }

  const firstAt = firstEventAt(parsed)
  const endedAt = extractSessionEndedAt(parsed)
  const lastAt = lastEventAt(parsed)
  const durationMs = new Date(lastAt).getTime() - new Date(firstAt).getTime()
  const iterationCount = parsed.filter(isIterationTaskAssigned).length

  return makeSessionListItem(sessionId, firstAt, endedAt, durationMs, iterationCount, extractCurrentState(parsed))
}

function makeSessionListItem(
  sessionId: string,
  startedAt: string,
  endedAt: string | undefined,
  durationMs: number,
  iterationCount: number,
  currentState: string
): SessionListItem {
  if (endedAt !== undefined) {
    return { sessionId, startedAt, endedAt, durationMs, iterationCount, currentState }
  }
  return { sessionId, startedAt, durationMs, iterationCount, currentState }
}

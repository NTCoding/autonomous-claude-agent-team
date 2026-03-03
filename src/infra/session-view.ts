import type { BaseEvent } from '../workflow-engine/index.js'

export type IterationGroup = {
  iterationIndex: number
  task: string
  events: readonly BaseEvent[]
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
  recentEvents: readonly BaseEvent[]
}

export type SessionListItem = {
  sessionId: string
  startedAt: string
  endedAt?: string | undefined
  durationMs: number
  iterationCount: number
  currentState: string
}

const TRANSITION_TYPE = 'workflow.state.transitioned'
const ITERATION_TASK_TYPE = 'workflow.iteration.task-assigned'
const SESSION_ENDED_TYPE = 'workflow.session.ended'
const DEFAULT_STATE = 'idle'
const RECENT_EVENT_COUNT = 20

type TransitionedEvent = BaseEvent & { toState: string }
type IterationTaskEvent = BaseEvent & { task: string }

function firstEventAt(events: readonly BaseEvent[]): string {
  return events.slice(0, 1).reduce((_acc, e) => e.at, '')
}

function lastEventAt(events: readonly BaseEvent[]): string {
  return events.reduce((_acc, e) => e.at, '')
}

function hasStringProp(obj: object, key: string): boolean {
  return key in obj && typeof Reflect.get(obj, key) === 'string'
}

function isTransitionedEvent(e: BaseEvent): e is TransitionedEvent {
  return e.type === TRANSITION_TYPE && hasStringProp(e, 'toState')
}

function isIterationTaskEvent(e: BaseEvent): e is IterationTaskEvent {
  return e.type === ITERATION_TASK_TYPE && hasStringProp(e, 'task')
}

function extractCurrentState(events: readonly BaseEvent[]): string {
  const transitions = events.filter(isTransitionedEvent)
  return transitions.reduce((_acc: string, e: TransitionedEvent) => e.toState, DEFAULT_STATE)
}

function extractSessionEndedAt(events: readonly BaseEvent[]): string | undefined {
  const ended = events.find((e) => e.type === SESSION_ENDED_TYPE)
  return ended?.at
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
  event: TransitionedEvent
): PeriodAccum {
  const durationMs = new Date(event.at).getTime() - new Date(accum.currentStartedAt).getTime()
  const period = makePeriod(accum.currentState, accum.currentStartedAt, event.at, durationMs)
  return {
    periods: [...accum.periods, period],
    currentState: event.toState,
    currentStartedAt: event.at,
  }
}

function withProportions(periods: StatePeriod[], totalDurationMs: number): readonly StatePeriod[] {
  if (totalDurationMs === 0) return periods
  return periods.map((p) => ({ ...p, proportionOfTotal: p.durationMs / totalDurationMs }))
}

function computeStatePeriods(events: readonly BaseEvent[], totalDurationMs: number): readonly StatePeriod[] {
  const start = firstEventAt(events)
  const transitions = events.filter(isTransitionedEvent)
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
  currentEvents: BaseEvent[]
  currentStartedAt: string
}

function makeIterationGroup(
  iterationIndex: number,
  task: string,
  events: BaseEvent[],
  startedAt: string,
  endedAt: string | undefined
): IterationGroup {
  if (endedAt !== undefined) {
    return { iterationIndex, task, events, startedAt, endedAt }
  }
  return { iterationIndex, task, events, startedAt }
}

function reduceToIterationGroups(accum: GroupAccum, event: BaseEvent): GroupAccum {
  if (!isIterationTaskEvent(event)) {
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

function groupEventsByIteration(events: readonly BaseEvent[]): readonly IterationGroup[] {
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
  recentEvents: readonly BaseEvent[]
): SessionViewData {
  if (endedAt !== undefined) {
    return { sessionId, startedAt, endedAt, currentState, totalDurationMs, statePeriods, iterationGroups, recentEvents }
  }
  return { sessionId, startedAt, currentState, totalDurationMs, statePeriods, iterationGroups, recentEvents }
}

export function buildSessionViewData(sessionId: string, events: readonly BaseEvent[]): SessionViewData {
  if (events.length === 0) {
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

  const firstAt = firstEventAt(events)
  const endedAt = extractSessionEndedAt(events)
  const lastAt = lastEventAt(events)
  const totalDurationMs = new Date(lastAt).getTime() - new Date(firstAt).getTime()

  return makeSessionViewData(
    sessionId,
    firstAt,
    endedAt,
    extractCurrentState(events),
    totalDurationMs,
    computeStatePeriods(events, totalDurationMs),
    groupEventsByIteration(events),
    events.slice(-RECENT_EVENT_COUNT)
  )
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

export function buildSessionListItem(sessionId: string, events: readonly BaseEvent[]): SessionListItem {
  if (events.length === 0) {
    return {
      sessionId,
      startedAt: new Date(0).toISOString(),
      durationMs: 0,
      iterationCount: 0,
      currentState: DEFAULT_STATE,
    }
  }

  const firstAt = firstEventAt(events)
  const endedAt = extractSessionEndedAt(events)
  const lastAt = lastEventAt(events)
  const durationMs = new Date(lastAt).getTime() - new Date(firstAt).getTime()
  const iterationCount = events.filter(isIterationTaskEvent).length

  return makeSessionListItem(sessionId, firstAt, endedAt, durationMs, iterationCount, extractCurrentState(events))
}

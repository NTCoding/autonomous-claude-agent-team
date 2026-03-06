import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RouteParams } from '../router.js'
import { sendJson, sendError } from '../router.js'
import type { SessionQueryDeps } from '../../query/session-queries.js'
import {
  getDistinctSessionIds,
  getSessionEvents,
  getSessionEventsPaginated,
} from '../../query/session-queries.js'
import {
  projectSession,
  projectSessionSummary,
} from '../../analytics/session-projector.js'
import { computeInsights } from '../../analytics/insight-rules.js'
import { computeSuggestions } from '../../analytics/suggestion-rules.js'
import {
  categorizeEvent,
  extractEventDetail,
  isPermissionDenied,
} from '../../query/query-types.js'
import type { AnnotatedEvent, EventCategory } from '../../query/query-types.js'

export type SessionHandlerDeps = {
  readonly queryDeps: SessionQueryDeps
  readonly now: () => Date
  readonly defaultRepository?: string
}

export function handleListSessions(
  deps: SessionHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const status = route.query.get('status') ?? undefined
    const limit = parseInt(route.query.get('limit') ?? '50', 10)
    const offset = parseInt(route.query.get('offset') ?? '0', 10)

    const sessionIds = getDistinctSessionIds(deps.queryDeps)
    const now = deps.now()

    const summaries = sessionIds.map((sessionId) => {
      const events = getSessionEvents(deps.queryDeps, sessionId)
      const projection = projectSession(sessionId, events)
      const summary = projectSessionSummary(projection, now)
      return { ...summary, repository: summary.repository ?? deps.defaultRepository }
    })

    const filtered = status
      ? summaries.filter((s) => s.status === status)
      : summaries

    const sorted = [...filtered].sort((a, b) =>
      b.lastEventAt.localeCompare(a.lastEventAt),
    )

    const paged = sorted.slice(offset, offset + limit)

    sendJson(res, 200, { sessions: paged, total: filtered.length })
  }
}

export function handleGetSession(
  deps: SessionHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const sessionId = route.params['id']
    if (!sessionId) {
      sendError(res, 400, 'Missing session ID')
      return
    }

    const events = getSessionEvents(deps.queryDeps, sessionId)
    if (events.length === 0) {
      sendError(res, 404, `Session ${sessionId} not found`)
      return
    }

    const now = deps.now()
    const projection = projectSession(sessionId, events)
    const summary = projectSessionSummary(projection, now)
    const insights = computeInsights(projection, now)
    const suggestions = computeSuggestions(projection, now)

    sendJson(res, 200, {
      ...summary,
      repository: summary.repository ?? deps.defaultRepository,
      journalEntries: projection.journalEntries,
      insights,
      suggestions,
      statePeriods: projection.statePeriods,
    })
  }
}

export function handleGetSessionEvents(
  deps: SessionHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const sessionId = route.params['id']
    if (!sessionId) {
      sendError(res, 400, 'Missing session ID')
      return
    }

    const limit = parseInt(route.query.get('limit') ?? '100', 10)
    const offset = parseInt(route.query.get('offset') ?? '0', 10)
    const category = route.query.get('category') ?? undefined
    const type = route.query.get('type') ?? undefined
    const deniedParam = route.query.get('denied')
    const denied = deniedParam === 'true' ? true : deniedParam === 'false' ? false : undefined

    const { events, total } = getSessionEventsPaginated(
      deps.queryDeps,
      sessionId,
      limit + offset,
      0,
      { type },
    )

    const allEvents = getSessionEvents(deps.queryDeps, sessionId)
    let currentState = 'idle'
    const stateMap = new Map<number, string>()
    for (const e of allEvents) {
      if (e.type === 'transitioned') {
        currentState = String(e.payload['to'] ?? 'unknown')
      }
      stateMap.set(e.seq, currentState)
    }

    const annotated: Array<AnnotatedEvent> = events.map((e) => ({
      ...e,
      category: categorizeEvent(e.type),
      state: stateMap.get(e.seq) ?? 'idle',
      detail: extractEventDetail(e),
      denied: isPermissionDenied(e),
    }))

    const filtered = annotated
      .filter((e) => !category || e.category === (category as EventCategory))
      .filter((e) => denied === undefined || e.denied === denied)

    const paged = filtered.slice(offset, offset + limit)

    sendJson(res, 200, {
      events: paged,
      total: category || denied !== undefined ? filtered.length : total,
    })
  }
}

export function handleGetSessionJournal(
  deps: SessionHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const sessionId = route.params['id']
    if (!sessionId) {
      sendError(res, 400, 'Missing session ID')
      return
    }

    const events = getSessionEvents(deps.queryDeps, sessionId)
    if (events.length === 0) {
      sendError(res, 404, `Session ${sessionId} not found`)
      return
    }

    const projection = projectSession(sessionId, events)

    sendJson(res, 200, { entries: projection.journalEntries })
  }
}

export function handleGetSessionInsights(
  deps: SessionHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const sessionId = route.params['id']
    if (!sessionId) {
      sendError(res, 400, 'Missing session ID')
      return
    }

    const events = getSessionEvents(deps.queryDeps, sessionId)
    if (events.length === 0) {
      sendError(res, 404, `Session ${sessionId} not found`)
      return
    }

    const now = deps.now()
    const projection = projectSession(sessionId, events)
    const insights = computeInsights(projection, now)

    sendJson(res, 200, { insights })
  }
}

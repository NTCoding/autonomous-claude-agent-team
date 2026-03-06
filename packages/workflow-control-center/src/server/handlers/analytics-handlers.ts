import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RouteParams } from '../router.js'
import { sendJson, sendError } from '../router.js'
import type { SessionQueryDeps } from '../../query/session-queries.js'
import { getDistinctSessionIds, getSessionEvents } from '../../query/session-queries.js'
import {
  projectSession,
  projectSessionSummary,
} from '../../analytics/session-projector.js'
import {
  computeOverview,
  computeTrends,
  computePatterns,
} from '../../analytics/cross-session-analytics.js'
import { comparesessions } from '../../analytics/comparator.js'
import { computeInsights } from '../../analytics/insight-rules.js'
import { computeSuggestions } from '../../analytics/suggestion-rules.js'
import type { TrendBucket } from '../../query/query-types.js'

export type AnalyticsHandlerDeps = {
  readonly queryDeps: SessionQueryDeps
  readonly now: () => Date
}

function loadAllProjections(deps: AnalyticsHandlerDeps) {
  const sessionIds = getDistinctSessionIds(deps.queryDeps)
  const now = deps.now()

  const projections = sessionIds.map((sessionId) => {
    const events = getSessionEvents(deps.queryDeps, sessionId)
    return projectSession(sessionId, events)
  })

  const summaries = projections.map((p) => projectSessionSummary(p, now))

  return { projections, summaries }
}

export function handleAnalyticsOverview(
  deps: AnalyticsHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, _route: RouteParams) => void {
  return (_req, res) => {
    const { projections, summaries } = loadAllProjections(deps)
    const overview = computeOverview(summaries, projections)
    sendJson(res, 200, overview)
  }
}

export function handleAnalyticsTrends(
  deps: AnalyticsHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const metric = route.query.get('metric') ?? 'duration'
    const window = route.query.get('window') ?? '30d'
    const bucket = (route.query.get('bucket') ?? 'day') as TrendBucket

    const windowDays = window === '7d' ? 7 : window === '90d' ? 90 : 30

    const { summaries } = loadAllProjections(deps)
    const dataPoints = computeTrends(summaries, metric, windowDays, bucket)

    sendJson(res, 200, { dataPoints })
  }
}

export function handleAnalyticsPatterns(
  deps: AnalyticsHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, _route: RouteParams) => void {
  return (_req, res) => {
    const { projections } = loadAllProjections(deps)
    const now = deps.now()
    const patterns = computePatterns(projections, now)
    sendJson(res, 200, { patterns })
  }
}

export function handleAnalyticsCompare(
  deps: AnalyticsHandlerDeps,
): (_req: IncomingMessage, res: ServerResponse, route: RouteParams) => void {
  return (_req, res, route) => {
    const idA = route.query.get('a')
    const idB = route.query.get('b')

    if (!idA || !idB) {
      sendError(res, 400, 'Both ?a=ID and ?b=ID query params required')
      return
    }

    const now = deps.now()

    const eventsA = getSessionEvents(deps.queryDeps, idA)
    if (eventsA.length === 0) {
      sendError(res, 404, `Session ${idA} not found`)
      return
    }

    const eventsB = getSessionEvents(deps.queryDeps, idB)
    if (eventsB.length === 0) {
      sendError(res, 404, `Session ${idB} not found`)
      return
    }

    const projA = projectSession(idA, eventsA)
    const projB = projectSession(idB, eventsB)

    const summaryA = projectSessionSummary(projA, now)
    const summaryB = projectSessionSummary(projB, now)

    const insightsA = computeInsights(projA, now)
    const insightsB = computeInsights(projB, now)
    const suggestionsA = computeSuggestions(projA, now)
    const suggestionsB = computeSuggestions(projB, now)

    const detailA = {
      ...summaryA,
      journalEntries: projA.journalEntries,
      insights: insightsA,
      suggestions: suggestionsA,
      statePeriods: projA.statePeriods,
    }

    const detailB = {
      ...summaryB,
      journalEntries: projB.journalEntries,
      insights: insightsB,
      suggestions: suggestionsB,
      statePeriods: projB.statePeriods,
    }

    const comparison = comparesessions(detailA, detailB)
    sendJson(res, 200, comparison)
  }
}

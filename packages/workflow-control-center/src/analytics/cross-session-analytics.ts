import type {
  AnalyticsOverview,
  TrendDataPoint,
  TrendBucket,
  RecurringPattern,
  DenialHotspot,
  StateTimeSegment,
  SessionSummary,
  ParsedEvent,
} from '../query/query-types.js'
import type { SessionProjection } from './session-projector.js'
import { computeInsights } from './insight-rules.js'

export function computeOverview(
  summaries: ReadonlyArray<SessionSummary>,
  projections: ReadonlyArray<SessionProjection>,
): AnalyticsOverview {
  const totalSessions = summaries.length
  const activeSessions = summaries.filter((s) => s.status === 'active').length
  const completedSessions = summaries.filter((s) => s.status === 'completed').length
  const staleSessions = summaries.filter((s) => s.status === 'stale').length

  const totalEvents = summaries.reduce((sum, s) => sum + s.totalEvents, 0)
  const averageDurationMs =
    totalSessions > 0
      ? Math.round(summaries.reduce((sum, s) => sum + s.durationMs, 0) / totalSessions)
      : 0
  const averageTransitionCount =
    totalSessions > 0
      ? Math.round(
          summaries.reduce((sum, s) => sum + s.transitionCount, 0) / totalSessions,
        )
      : 0
  const averageDenialCount =
    totalSessions > 0
      ? Math.round(
          summaries.reduce(
            (sum, s) =>
              sum +
              s.permissionDenials.write +
              s.permissionDenials.bash +
              s.permissionDenials.pluginRead +
              s.permissionDenials.idle,
            0,
          ) / totalSessions,
        )
      : 0

  const denialHotspots = computeDenialHotspots(projections)
  const stateTimeDistribution = computeStateTimeDistribution(projections)

  return {
    totalSessions,
    activeSessions,
    completedSessions,
    staleSessions,
    averageDurationMs,
    averageTransitionCount,
    averageDenialCount,
    totalEvents,
    denialHotspots,
    stateTimeDistribution,
  }
}

function computeDenialHotspots(
  projections: ReadonlyArray<SessionProjection>,
): ReadonlyArray<DenialHotspot> {
  const hotspotMap = new Map<string, number>()

  for (const p of projections) {
    if (p.permissionDenials.write > 0) {
      hotspotMap.set('write', (hotspotMap.get('write') ?? 0) + p.permissionDenials.write)
    }
    if (p.permissionDenials.bash > 0) {
      hotspotMap.set('bash', (hotspotMap.get('bash') ?? 0) + p.permissionDenials.bash)
    }
    if (p.permissionDenials.pluginRead > 0) {
      hotspotMap.set(
        'pluginRead',
        (hotspotMap.get('pluginRead') ?? 0) + p.permissionDenials.pluginRead,
      )
    }
    if (p.permissionDenials.idle > 0) {
      hotspotMap.set('idle', (hotspotMap.get('idle') ?? 0) + p.permissionDenials.idle)
    }
  }

  return [...hotspotMap.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

function computeStateTimeDistribution(
  projections: ReadonlyArray<SessionProjection>,
): ReadonlyArray<StateTimeSegment> {
  const stateMs = new Map<string, number>()
  let totalMs = 0

  for (const p of projections) {
    for (const period of p.statePeriods) {
      stateMs.set(period.state, (stateMs.get(period.state) ?? 0) + period.durationMs)
      totalMs += period.durationMs
    }
  }

  if (totalMs === 0) return []

  return [...stateMs.entries()]
    .map(([state, ms]) => ({
      state,
      totalMs: ms,
      percentage: Math.round((ms / totalMs) * 100),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

export function computeTrends(
  summaries: ReadonlyArray<SessionSummary>,
  metric: string,
  windowDays: number,
  bucket: TrendBucket,
): ReadonlyArray<TrendDataPoint> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const bucketMs = bucket === 'day' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000

  const filtered = summaries.filter(
    (s) => new Date(s.firstEventAt).getTime() >= windowStart.getTime(),
  )

  const buckets = new Map<string, Array<SessionSummary>>()

  for (const session of filtered) {
    const sessionDate = new Date(session.firstEventAt)
    const bucketStart = new Date(
      Math.floor(sessionDate.getTime() / bucketMs) * bucketMs,
    )
    const key = bucketStart.toISOString()
    const existing = buckets.get(key)
    if (existing) {
      existing.push(session)
    } else {
      buckets.set(key, [session])
    }
  }

  return [...buckets.entries()]
    .map(([bucketStart, sessions]) => ({
      bucketStart,
      value: computeMetricValue(sessions, metric),
    }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
}

function computeMetricValue(
  sessions: ReadonlyArray<SessionSummary>,
  metric: string,
): number {
  switch (metric) {
    case 'duration':
      return Math.round(
        sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessions.length,
      )
    case 'denials':
      return sessions.reduce(
        (sum, s) =>
          sum +
          s.permissionDenials.write +
          s.permissionDenials.bash +
          s.permissionDenials.pluginRead +
          s.permissionDenials.idle,
        0,
      )
    case 'transitions':
      return sessions.reduce((sum, s) => sum + s.transitionCount, 0)
    case 'sessions':
      return sessions.length
    default:
      return 0
  }
}

export function computePatterns(
  projections: ReadonlyArray<SessionProjection>,
  now: Date,
): ReadonlyArray<RecurringPattern> {
  const insightCounts = new Map<string, Array<string>>()

  for (const p of projections) {
    const insights = computeInsights(p, now)
    for (const insight of insights) {
      const existing = insightCounts.get(insight.title)
      if (existing) {
        existing.push(p.sessionId)
      } else {
        insightCounts.set(insight.title, [p.sessionId])
      }
    }
  }

  const total = projections.length
  if (total === 0) return []

  return [...insightCounts.entries()]
    .filter(([, sessionIds]) => sessionIds.length >= 2)
    .map(([insightTitle, sessionIds]) => ({
      insightTitle,
      sessionCount: sessionIds.length,
      percentage: Math.round((sessionIds.length / total) * 100),
      exampleSessionIds: sessionIds.slice(0, 3),
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
}

export function computeEventFrequency(
  events: ReadonlyArray<ParsedEvent>,
): ReadonlyArray<{ readonly type: string; readonly count: number }> {
  const counts = new Map<string, number>()
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

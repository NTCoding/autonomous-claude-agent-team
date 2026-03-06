import type { SessionDetail, ComparisonDeltas, SessionComparison } from '../query/query-types.js'

function totalDenials(detail: SessionDetail): number {
  return (
    detail.permissionDenials.write +
    detail.permissionDenials.bash +
    detail.permissionDenials.pluginRead +
    detail.permissionDenials.idle
  )
}

function percentDelta(a: number, b: number): number {
  if (a === 0 && b === 0) return 0
  if (a === 0) return 100
  return Math.round(((b - a) / a) * 100)
}

export function computeDeltas(a: SessionDetail, b: SessionDetail): ComparisonDeltas {
  return {
    durationMs: b.durationMs - a.durationMs,
    durationPercent: percentDelta(a.durationMs, b.durationMs),
    transitionCount: b.transitionCount - a.transitionCount,
    transitionPercent: percentDelta(a.transitionCount, b.transitionCount),
    totalDenials: totalDenials(b) - totalDenials(a),
    denialPercent: percentDelta(totalDenials(a), totalDenials(b)),
    eventCount: b.totalEvents - a.totalEvents,
    eventPercent: percentDelta(a.totalEvents, b.totalEvents),
  }
}

export function comparesessions(
  a: SessionDetail,
  b: SessionDetail,
): SessionComparison {
  return {
    sessionA: a,
    sessionB: b,
    deltas: computeDeltas(a, b),
  }
}

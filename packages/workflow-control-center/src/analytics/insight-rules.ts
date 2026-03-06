import type { Insight, PermissionDenials } from '../query/query-types.js'
import type { SessionProjection } from './session-projector.js'

type InsightInput = {
  readonly projection: SessionProjection
  readonly now: Date
}

type InsightRule = (input: InsightInput) => Insight | undefined

function totalDenials(d: PermissionDenials): number {
  return d.write + d.bash + d.pluginRead + d.idle
}

function totalPermissionChecks(events: SessionProjection): number {
  return events.totalEvents
}

const permissionDenialCluster: InsightRule = ({ projection }) => {
  const denials = totalDenials(projection.permissionDenials)
  if (denials < 3) return undefined

  return {
    severity: 'warning',
    title: 'Permission denial cluster',
    evidence: `${denials} permission denials detected`,
  }
}

const highDenialRate: InsightRule = ({ projection }) => {
  const denials = totalDenials(projection.permissionDenials)
  const checks = totalPermissionChecks(projection)
  if (checks === 0) return undefined
  const rate = denials / checks
  if (rate > 0.3) {
    return {
      severity: 'warning',
      title: 'High denial rate',
      evidence: `${Math.round(rate * 100)}% of permission checks denied (${denials}/${checks})`,
    }
  }
  return undefined
}

const longStateDwell: InsightRule = ({ projection }) => {
  if (projection.transitionCount <= 2) return undefined

  const totalMs = projection.statePeriods.reduce((sum, p) => sum + p.durationMs, 0)
  if (totalMs === 0) return undefined

  for (const period of projection.statePeriods) {
    if (period.durationMs / totalMs > 0.5) {
      return {
        severity: 'info',
        title: 'Long state dwell',
        evidence: `${period.state} occupied ${Math.round((period.durationMs / totalMs) * 100)}% of session time`,
      }
    }
  }

  return undefined
}

const agentChurn: InsightRule = () => {
  return undefined
}

const blockedState: InsightRule = ({ projection }) => {
  const blockedPeriods = projection.statePeriods.filter(
    (p) => p.state === 'BLOCKED',
  )
  if (blockedPeriods.length > 0) {
    return {
      severity: 'warning',
      title: 'Blocked state entered',
      evidence: `Session entered BLOCKED state ${blockedPeriods.length} time(s)`,
    }
  }
  return undefined
}

const zeroDenials: InsightRule = ({ projection }) => {
  if (projection.transitionCount < 2) return undefined
  const denials = totalDenials(projection.permissionDenials)
  if (denials === 0) {
    return {
      severity: 'success',
      title: 'Zero permission denials',
      evidence: `${projection.transitionCount} transitions with no denials`,
    }
  }
  return undefined
}

const staleSession: InsightRule = ({ projection, now }) => {
  if (!projection.lastEventAt) return undefined
  const elapsed = now.getTime() - new Date(projection.lastEventAt).getTime()
  const thirtyMinutes = 30 * 60 * 1000
  if (elapsed > thirtyMinutes && projection.currentState !== 'COMPLETE') {
    return {
      severity: 'warning',
      title: 'Stale session',
      evidence: `No events for ${Math.round(elapsed / 60000)} minutes, last state: ${projection.currentState}`,
    }
  }
  return undefined
}

const INSIGHT_RULES: ReadonlyArray<InsightRule> = [
  permissionDenialCluster,
  highDenialRate,
  longStateDwell,
  agentChurn,
  blockedState,
  zeroDenials,
  staleSession,
]

export function computeInsights(projection: SessionProjection, now: Date): ReadonlyArray<Insight> {
  const input: InsightInput = { projection, now }
  const insights: Array<Insight> = []

  for (const rule of INSIGHT_RULES) {
    const result = rule(input)
    if (result) {
      insights.push(result)
    }
  }

  const severityOrder = { warning: 0, info: 1, success: 2 } as const
  return insights.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  )
}

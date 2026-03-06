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
    evidence: `${denials} permission denials detected (write: ${projection.permissionDenials.write}, bash: ${projection.permissionDenials.bash}, plugin-read: ${projection.permissionDenials.pluginRead}, idle: ${projection.permissionDenials.idle})`,
    prompt: `Analyze the ${denials} permission denials in this session. Which hook rules are agents violating? Are the rules too restrictive or are agents misbehaving? Suggest specific rule adjustments or agent instruction changes.`,
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
      prompt: `The denial rate is ${Math.round(rate * 100)}%. Investigate whether hook rules are misconfigured or if agents need clearer instructions about what operations are permitted in each state.`,
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
      const pct = Math.round((period.durationMs / totalMs) * 100)
      return {
        severity: 'info',
        title: 'Long state dwell',
        evidence: `${period.state} occupied ${pct}% of session time`,
        prompt: `The ${period.state} state consumed ${pct}% of the session. Investigate what caused the session to spend so long in this state. Is this expected for the task complexity, or is there a bottleneck?`,
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
      prompt: `This session was blocked ${blockedPeriods.length} time(s). Review the transition events to understand why the workflow got stuck. What preconditions failed? Should the state machine transitions be adjusted?`,
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
      prompt: undefined,
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
      prompt: `This session has been inactive for ${Math.round(elapsed / 60000)} minutes in the ${projection.currentState} state. Check if the agent process is still running or if it needs to be restarted.`,
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

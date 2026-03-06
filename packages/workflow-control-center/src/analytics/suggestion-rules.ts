import type { Suggestion, PermissionDenials } from '../query/query-types.js'
import type { SessionProjection } from './session-projector.js'

type SuggestionInput = {
  readonly projection: SessionProjection
  readonly now: Date
}

type SuggestionRule = (input: SuggestionInput) => Suggestion | undefined

function totalDenials(d: PermissionDenials): number {
  return d.write + d.bash + d.pluginRead + d.idle
}

const tightenBashRules: SuggestionRule = ({ projection }) => {
  if (projection.permissionDenials.bash < 2) return undefined

  return {
    title: '💡 Tighten bash permission rules',
    rationale: `${projection.permissionDenials.bash} bash commands were denied. Agents are attempting commands the hook rules block.`,
    change: 'Review denied bash commands and either whitelist legitimate patterns or add clearer instructions to agent prompts about which commands are permitted.',
    tradeoff: 'Whitelisting more commands reduces denials but widens the attack surface. Tighter prompts add complexity.',
    prompt: `Review the ${projection.permissionDenials.bash} denied bash commands in this session. For each denial, determine if the command should be allowed (update hook rules) or if the agent needs clearer instructions about what's permitted.`,
  }
}

const reduceStateDwellTime: SuggestionRule = ({ projection }) => {
  if (projection.transitionCount <= 2) return undefined

  const totalMs = projection.statePeriods.reduce((sum, p) => sum + p.durationMs, 0)
  if (totalMs === 0) return undefined

  const firstPeriod = projection.statePeriods[0]
  if (!firstPeriod) return undefined

  const longestPeriod = projection.statePeriods.reduce(
    (max, p) => (p.durationMs > max.durationMs ? p : max),
    firstPeriod,
  )

  if (longestPeriod.durationMs / totalMs <= 0.6) return undefined

  const pct = Math.round((longestPeriod.durationMs / totalMs) * 100)
  return {
    title: `💡 Reduce ${longestPeriod.state} dwell time`,
    rationale: `${longestPeriod.state} consumed ${pct}% of session time — disproportionate to other states.`,
    change: `Break the ${longestPeriod.state} state into smaller sub-tasks or add intermediate checkpoints to detect when work is stalling.`,
    tradeoff: 'More granular states increase transition overhead but improve visibility into progress.',
    prompt: `The ${longestPeriod.state} state took ${pct}% of session time. Analyze what happened during this period. Was the agent stuck, or was this proportionate to task complexity? Suggest ways to add intermediate checkpoints.`,
  }
}

const addWritePermissionGuards: SuggestionRule = ({ projection }) => {
  if (projection.permissionDenials.write < 2) return undefined

  return {
    title: '💡 Add write permission guards',
    rationale: `${projection.permissionDenials.write} file write attempts were denied. Agents are trying to write to protected paths.`,
    change: 'Add explicit file path patterns to the write hook rules, or update agent instructions to clarify which directories are writable in each state.',
    tradeoff: 'Broader write permissions speed development but reduce safety guarantees.',
    prompt: `Review the ${projection.permissionDenials.write} denied file writes. Which paths were agents trying to write to? Should those paths be allowed, or should agents be directed to different locations?`,
  }
}

const improveAgentHandoff: SuggestionRule = ({ projection }) => {
  if (projection.activeAgents.length < 2) return undefined

  const denials = totalDenials(projection.permissionDenials)
  if (denials < 3) return undefined

  return {
    title: '💡 Improve agent handoff coordination',
    rationale: `${projection.activeAgents.length} agents active with ${denials} permission denials — may indicate coordination issues between agents.`,
    change: 'Add explicit handoff protocols between agents or tighten state-based permission scoping so each agent only operates in its designated states.',
    tradeoff: 'Stricter coordination reduces parallelism but prevents agents from stepping on each other.',
    prompt: `${projection.activeAgents.length} agents (${projection.activeAgents.join(', ')}) generated ${denials} denials. Analyze whether denials correlate with agent transitions. Are agents attempting operations outside their designated workflow phase?`,
  }
}

const SUGGESTION_RULES: ReadonlyArray<SuggestionRule> = [
  tightenBashRules,
  reduceStateDwellTime,
  addWritePermissionGuards,
  improveAgentHandoff,
]

export function computeSuggestions(projection: SessionProjection, now: Date): ReadonlyArray<Suggestion> {
  const input: SuggestionInput = { projection, now }
  const suggestions: Array<Suggestion> = []

  for (const rule of SUGGESTION_RULES) {
    const result = rule(input)
    if (result) {
      suggestions.push(result)
    }
  }

  return suggestions
}

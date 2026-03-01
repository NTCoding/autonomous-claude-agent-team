import type { WorkflowState, StateName } from './workflow-state.js'

export type SpawnDecision = { readonly allow: true } | { readonly allow: false; readonly reason: string }

type NameCheckResult =
  | { readonly valid: true; readonly role: string }
  | { readonly valid: false; readonly decision: SpawnDecision }

const AGENT_NAME_PATTERN = /^(developer|reviewer|lead)-(\d+)$/

const SPAWN_ALLOWED_STATES: ReadonlySet<StateName> = new Set(['SPAWN', 'RESPAWN', 'DEVELOPING'])

export function checkSpawnAllowed(
  agentName: string,
  agentType: string,
  state: WorkflowState,
): SpawnDecision {
  if (isLeadAgent(agentName, agentType)) {
    return { allow: true }
  }

  const nameResult = validateAgentName(agentName)
  if (!nameResult.valid) return nameResult.decision

  const { role } = nameResult

  const duplicateCheck = checkDuplicateRole(role, agentName, state.activeAgents)
  if (!duplicateCheck.allow) return duplicateCheck

  const stateCheck = checkStateAllowsSpawn(role, state.state)
  if (!stateCheck.allow) return stateCheck

  const issueCheck = checkGithubIssueSet(role, state)
  if (!issueCheck.allow) return issueCheck

  return { allow: true }
}

function isLeadAgent(agentName: string, agentType: string): boolean {
  return agentName.startsWith('lead-') || agentType.includes('lead')
}

function validateAgentName(agentName: string): NameCheckResult {
  if (!agentName) {
    return {
      valid: false,
      decision: {
        allow: false,
        reason: 'Agent must have a name matching the format {role}-{iteration} (e.g. developer-1, reviewer-1).',
      },
    }
  }

  const match = AGENT_NAME_PATTERN.exec(agentName)
  const role = match?.[1]
  if (!role) {
    return {
      valid: false,
      decision: {
        allow: false,
        reason: `Agent name '${agentName}' does not match required format '{role}-{iteration}'. Use the Agent tool with team_name: feature-team and name the agent correctly (e.g. developer-1, reviewer-1).`,
      },
    }
  }

  return { valid: true, role }
}

function checkDuplicateRole(
  role: string,
  agentName: string,
  activeAgents: readonly string[],
): SpawnDecision {
  const hasDuplicate = activeAgents
    .filter((name) => name !== agentName)
    .some((name) => name.startsWith(`${role}-`))

  if (hasDuplicate) {
    return {
      allow: false,
      reason: `A ${role} agent is already active. Shut down the existing ${role} before spawning a new one.`,
    }
  }

  return { allow: true }
}

function checkStateAllowsSpawn(role: string, currentState: StateName): SpawnDecision {
  if (!SPAWN_ALLOWED_STATES.has(currentState)) {
    return {
      allow: false,
      reason: `Cannot spawn ${role} in ${currentState} state. Developers and reviewers can only be spawned in SPAWN, RESPAWN, or DEVELOPING.`,
    }
  }

  return { allow: true }
}

function checkGithubIssueSet(role: string, state: WorkflowState): SpawnDecision {
  if (!state.githubIssue) {
    return {
      allow: false,
      reason: `Cannot spawn ${role}: no GitHub issue recorded. The lead must create a GitHub issue and run record-issue <number> first.`,
    }
  }

  return { allow: true }
}

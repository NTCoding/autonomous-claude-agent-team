export const LEAD_PREFIX_PATTERN = /^LEAD:/m

type IdentityCheckResult =
  | { status: 'verified' }
  | { status: 'never-spoken' }
  | { status: 'silent-turn' }
  | { status: 'lost'; recoveryMessage: string }

export type AssistantMessage = {
  readonly id: string
  readonly hasTextContent: boolean
  readonly startsWithLeadPrefix: boolean
}

export function buildLeadPrefix(state: string, emoji: string): string {
  return `${emoji} LEAD: ${state}`
}

export function buildRecoveryMessage(state: string, emoji: string): string {
  const prefix = buildLeadPrefix(state, emoji)
  const stateLower = state.toLowerCase().replace(/_/g, '-')
  return (
    `You have lost your feature-team-lead identity. Re-read \${CLAUDE_PLUGIN_ROOT}/agents/feature-team-lead.md. ` +
    `Current state: ${state}. Every message MUST start with the state prefix — ` +
    `your next response MUST begin with: '${prefix}'. ` +
    `Read \${CLAUDE_PLUGIN_ROOT}/states/${stateLower}.md for your current procedure.`
  )
}

export function checkLeadIdentity(
  messages: readonly AssistantMessage[],
  state: string,
  emoji: string,
): IdentityCheckResult {
  const hasEverSpokenAsLead = messages.some((m) => m.hasTextContent && m.startsWithLeadPrefix)

  if (!hasEverSpokenAsLead) {
    return { status: 'never-spoken' }
  }

  const lastMessage = messages.at(-1)
  if (!lastMessage?.hasTextContent) {
    return { status: 'silent-turn' }
  }

  if (lastMessage.startsWithLeadPrefix) {
    return { status: 'verified' }
  }

  return {
    status: 'lost',
    recoveryMessage: buildRecoveryMessage(state, emoji),
  }
}

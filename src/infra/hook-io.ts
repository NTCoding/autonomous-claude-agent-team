export const EXIT_ALLOW = 0
export const EXIT_BLOCK = 2
export const EXIT_ERROR = 1

export function formatDenyDecision(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
}

export function formatContextInjection(context: string): string {
  return JSON.stringify({ additionalContext: context })
}

import type { StateName } from './workflow-state.js'

export const TRANSITION_MAP: Readonly<Record<StateName, readonly StateName[]>> = {
  SPAWN: ['PLANNING'],
  PLANNING: ['RESPAWN'],
  RESPAWN: ['DEVELOPING'],
  DEVELOPING: ['REVIEWING'],
  REVIEWING: ['COMMITTING', 'DEVELOPING'],
  COMMITTING: ['RESPAWN', 'CR_REVIEW'],
  CR_REVIEW: ['PR_CREATION'],
  PR_CREATION: ['FEEDBACK'],
  FEEDBACK: ['COMPLETE', 'RESPAWN'],
  BLOCKED: [],
  COMPLETE: [],
}

export type TransitionLegalityResult =
  | { legal: true }
  | { legal: false; reason: string }

export function isTransitionLegal(
  from: StateName,
  to: StateName,
  preBlockedState: StateName | undefined,
): TransitionLegalityResult {
  if (to === 'BLOCKED') {
    return { legal: true }
  }

  if (from === 'BLOCKED') {
    if (to === preBlockedState) {
      return { legal: true }
    }
    return {
      legal: false,
      reason: `Cannot transition from BLOCKED to ${to}. Must return to pre-blocked state: ${preBlockedState ?? 'unknown'}.`,
    }
  }

  /* v8 ignore next */
  const allowed = TRANSITION_MAP[from] ?? []
  if (allowed.includes(to)) {
    return { legal: true }
  }

  return {
    legal: false,
    reason: `Illegal transition ${from} → ${to}. Legal targets from ${from}: [${allowed.join(', ') || 'none'}].`,
  }
}

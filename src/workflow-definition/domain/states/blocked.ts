import type { ConcreteStateDefinition } from '../workflow-types.js'
import { fail, pass } from '../../../workflow-dsl/index.js'

export const blockedState: ConcreteStateDefinition = {
  emoji: '⚠️',
  agentInstructions: 'states/blocked.md',
  canTransitionTo: [
    'SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING',
    'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK',
  ],
  allowedWorkflowOperations: [],
  transitionGuard: (ctx) => {
    const preBlockedState = ctx.state.preBlockedState
    if (ctx.to !== preBlockedState) {
      return fail(`Cannot transition from BLOCKED to ${ctx.to}. Must return to pre-blocked state: ${preBlockedState ?? 'unknown'}.`)
    }
    return pass()
  },
}

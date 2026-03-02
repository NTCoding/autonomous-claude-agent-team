import type { ConcreteStateDefinition } from '../../workflow-types.js'
import { fail, pass } from '../../../../workflow-dsl/index.js'

export const blockedState: ConcreteStateDefinition = {
  emoji: '⚠️',
  agentInstructions: 'states/blocked.md',
  canTransitionTo: [
    'SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING',
    'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK',
  ],
  allowedWorkflowOperations: [],
  onEntry: (state, ctx) => ({
    ...state,
    preBlockedState: ctx.from,
  }),
  transitionGuard: (ctx) => {
    if (ctx.to !== ctx.state.preBlockedState) {
      return fail(`Cannot transition from BLOCKED to ${ctx.to}. Must return to pre-blocked state: ${ctx.state.preBlockedState ?? 'unknown'}.`)
    }
    return pass()
  },
}

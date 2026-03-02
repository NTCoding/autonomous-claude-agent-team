import type { ConcreteStateDefinition } from '../workflow-types.js'
import { StateNameSchema } from '../workflow-types.js'
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
    const lastBlockedEntry = [...ctx.state.eventLog]
      .reverse()
      .find((e) => e.op === 'transition' && e.detail?.['to'] === 'BLOCKED')
    const preBlockedState = StateNameSchema.safeParse(lastBlockedEntry?.detail?.['from']).data
    if (ctx.to !== preBlockedState) {
      return fail(`Cannot transition from BLOCKED to ${ctx.to}. Must return to pre-blocked state: ${preBlockedState ?? 'unknown'}.`)
    }
    return pass()
  },
}

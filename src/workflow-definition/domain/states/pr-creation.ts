import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '../../../workflow-dsl/index.js'

export const prCreationState: ConcreteStateDefinition = {
  emoji: '🚀',
  agentInstructions: 'states/pr-creation.md',
  canTransitionTo: ['FEEDBACK', 'BLOCKED'],
  allowedWorkflowOperations: ['record-pr', 'create-pr'],

  transitionGuard: (ctx) => {
    if (!ctx.state.prNumber)
      return fail('prNumber not set. Run record-pr or create-pr first.')
    if (!ctx.prChecksPass)
      return fail(`PR checks failing for PR #${ctx.state.prNumber}.`)
    return pass()
  },
}

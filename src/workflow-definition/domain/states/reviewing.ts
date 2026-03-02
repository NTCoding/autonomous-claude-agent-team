import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '../../../workflow-dsl/index.js'

export const reviewingState: ConcreteStateDefinition = {
  emoji: '📋',
  agentInstructions: 'states/reviewing.md',
  canTransitionTo: ['COMMITTING', 'DEVELOPING', 'BLOCKED'],
  allowedWorkflowOperations: ['review-approved', 'review-rejected'],

  transitionGuard: (ctx) => {
    const currentIteration = ctx.state.iterations[ctx.state.iteration]
    if (ctx.to === 'COMMITTING' && !currentIteration?.reviewApproved)
      return fail('Review not approved. Run review-approved first.')
    if (ctx.to === 'DEVELOPING' && !currentIteration?.reviewRejected)
      return fail('Review not rejected. Run review-rejected first.')
    return pass()
  },
}

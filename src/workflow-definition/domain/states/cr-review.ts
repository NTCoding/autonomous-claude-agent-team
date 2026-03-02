import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '../../../workflow-dsl/index.js'

export const crReviewState: ConcreteStateDefinition = {
  emoji: '🐰',
  agentInstructions: 'states/cr-review.md',
  canTransitionTo: ['PR_CREATION', 'BLOCKED'],
  allowedWorkflowOperations: ['coderabbit-feedback-addressed', 'coderabbit-feedback-ignored'],

  transitionGuard: (ctx) => {
    const currentIteration = ctx.state.iterations[ctx.state.iteration]
    if (!currentIteration?.coderabbitFeedbackAddressed && !currentIteration?.coderabbitFeedbackIgnored)
      return fail('CodeRabbit feedback not resolved. Run coderabbit-feedback-addressed or coderabbit-feedback-ignored.')
    if (currentIteration?.coderabbitFeedbackAddressed && !ctx.gitInfo.hasCommitsVsDefault)
      return fail('Feedback marked as addressed but no commits found.')
    return pass()
  },
}

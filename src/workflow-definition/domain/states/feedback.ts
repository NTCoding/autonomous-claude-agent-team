import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'

export const feedbackState: ConcreteStateDefinition = {
  emoji: '💬',
  agentInstructions: 'states/feedback.md',
  canTransitionTo: ['COMPLETE', 'RESPAWN', 'BLOCKED'],
  allowedWorkflowOperations: [],

  transitionGuard: (ctx) => {
    if (ctx.to === 'RESPAWN') return pass()
    if (!ctx.state.prNumber)
      return fail('prNumber not set. Run record-pr or create-pr first.')
    if (!ctx.prChecksPass)
      return fail(`PR checks failing for PR #${ctx.state.prNumber}.`)
    return pass()
  },
}

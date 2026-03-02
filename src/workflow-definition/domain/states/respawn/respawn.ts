import type { ConcreteStateDefinition } from '../../workflow-types.js'
import { pass, fail } from '../../../../workflow-dsl/index.js'

export const respawnState: ConcreteStateDefinition = {
  emoji: '🔄',
  agentInstructions: 'states/respawn.md',
  canTransitionTo: ['DEVELOPING', 'BLOCKED'],
  allowedWorkflowOperations: ['assign-iteration-task'],

  forbidden: {
    write: true,
  },

  transitionGuard: (ctx) => {
    if (!(ctx.state.iterations.length > ctx.state.iteration))
      return fail('No iteration prepared. Run assign-iteration-task first.')
    if (ctx.state.activeAgents.length > 0)
      return fail(`Active agents still registered: [${ctx.state.activeAgents.join(', ')}].`)
    return pass()
  },
}

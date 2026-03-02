import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '../../../workflow-dsl/index.js'

export const spawnState: ConcreteStateDefinition = {
  emoji: '🟣',
  agentInstructions: 'states/spawn.md',
  canTransitionTo: ['PLANNING', 'BLOCKED'],
  allowedWorkflowOperations: ['record-issue'],

  transitionGuard: (ctx) => {
    if (!ctx.state.githubIssue)
      return fail('githubIssue not set. Run record-issue <number> first.')
    if (!ctx.state.activeAgents.some((n) => n.startsWith('developer-')))
      return fail('No developer agent spawned.')
    if (!ctx.state.activeAgents.some((n) => n.startsWith('reviewer-')))
      return fail('No reviewer agent spawned.')
    return pass()
  },
}

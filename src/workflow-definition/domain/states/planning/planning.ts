import type { ConcreteStateDefinition } from '../../workflow-types.js'
import { pass, fail } from '../../../../workflow-dsl/index.js'

export const planningState: ConcreteStateDefinition = {
  emoji: '⚪',
  agentInstructions: 'states/planning.md',
  canTransitionTo: ['RESPAWN', 'BLOCKED'],
  allowedWorkflowOperations: ['record-branch', 'record-plan-approval', 'append-issue-checklist'],

  allowForbidden: {
    bash: ['git checkout'],
  },

  transitionGuard: (ctx) => {
    if (!ctx.state.userApprovedPlan)
      return fail('userApprovedPlan is false. Run record-plan-approval.')
    if (!ctx.gitInfo.workingTreeClean)
      return fail('Working tree is not clean.')
    return pass()
  },
}

import type { ConcreteStateDefinition } from '../../workflow-types.js'

export const completeState: ConcreteStateDefinition = {
  emoji: '✅',
  agentInstructions: 'states/complete.md',
  canTransitionTo: [],
  allowedWorkflowOperations: [],
}

export { Workflow } from './domain/workflow.js'
export type { WorkflowDeps } from './domain/workflow.js'
export { FeatureTeamWorkflowDefinition } from './domain/workflow-adapter.js'

export {
  StateNameSchema,
  WorkflowStateSchema,
  INITIAL_STATE,
  createWorkflowStateSchema,
} from './domain/workflow-types.js'

export type {
  WorkflowState,
  IterationState,
  StateName,
} from './domain/workflow-types.js'

export type { WorkflowEvent } from './domain/workflow-events.js'
export { WorkflowEventSchema } from './domain/workflow-events.js'

export { applyEvents } from './domain/fold.js'

export { checkWriteAllowed } from './domain/workflow-predicates.js'
export { BASH_FORBIDDEN } from './domain/registry.js'

export { WorkflowError } from './infra/workflow-error.js'

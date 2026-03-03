export { Workflow } from './domain/workflow.js'
export type { WorkflowDeps } from './domain/workflow.js'
export { WorkflowAdapter } from './domain/workflow-adapter.js'

// Concrete types and schemas (moved from workflow-engine)
export {
  StateNameSchema,
  WorkflowStateSchema,
  INITIAL_STATE,
} from './domain/workflow-types.js'

// Workflow events
export type { WorkflowEvent } from './domain/workflow-events.js'
export { WorkflowEventSchema } from './domain/workflow-events.js'

// Fold
export { fold } from './domain/fold.js'

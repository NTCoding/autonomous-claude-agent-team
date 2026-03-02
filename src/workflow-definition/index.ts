export { Workflow } from './domain/workflow.js'
export type { WorkflowDeps } from './domain/workflow.js'
export { WorkflowAdapter } from './domain/workflow-adapter.js'

// Concrete types and schemas (moved from workflow-engine)
export {
  StateNameSchema,
  WorkflowStateSchema,
  INITIAL_STATE,
} from './domain/workflow-types.js'

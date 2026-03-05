export { Workflow } from './domain/workflow.js'
export type { WorkflowDeps } from './domain/workflow.js'
export { WorkflowAdapter } from './domain/workflow-adapter.js'

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

export type { AssistantMessage } from './domain/identity-rules.js'
export { LEAD_PREFIX_PATTERN, checkLeadIdentity } from './domain/identity-rules.js'

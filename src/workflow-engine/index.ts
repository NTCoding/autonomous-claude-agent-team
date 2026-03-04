export type { WorkflowState, IterationState } from './domain/workflow-state.js'

export type { BaseEvent } from './domain/base-event.js'
export { BaseEventSchema } from './domain/base-event.js'

export {
  createWorkflowStateSchema,
  WorkflowStateError,
} from './domain/workflow-state.js'

export type { AssistantMessage } from './domain/identity-rules.js'
export { LEAD_PREFIX_PATTERN, checkLeadIdentity } from './domain/identity-rules.js'

export { WorkflowEngine } from './domain/workflow-engine.js'
export type {
  EngineResult,
  RehydratableWorkflow,
  WorkflowFactory,
  WorkflowEventStore,
  WorkflowEngineDeps,
  WorkflowDeps as WorkflowRuntimeDeps,
} from './domain/workflow-engine.js'

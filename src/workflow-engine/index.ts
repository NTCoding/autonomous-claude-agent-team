// Types
export type { WorkflowState, IterationState } from './domain/workflow-state.js'

// Base event
export type { BaseEvent } from './domain/base-event.js'
export { BaseEventSchema } from './domain/base-event.js'

// Values — schema factory, error class
export {
  createWorkflowStateSchema,
  WorkflowStateError,
} from './domain/workflow-state.js'

// Identity rules
export type { AssistantMessage } from './domain/identity-rules.js'
export { LEAD_PREFIX_PATTERN } from './domain/identity-rules.js'

// Workflow engine
export { WorkflowEngine } from './domain/workflow-engine.js'
export type {
  EngineResult,
  WorkflowFactory,
  WorkflowEngineDeps,
  WorkflowDeps as WorkflowRuntimeDeps,
} from './domain/workflow-engine.js'

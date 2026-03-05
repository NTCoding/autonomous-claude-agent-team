export type { BaseWorkflowState } from './domain/workflow-state.js'
export { WorkflowStateError } from './domain/workflow-state.js'

export type { BaseEvent } from './domain/base-event.js'
export { BaseEventSchema } from './domain/base-event.js'

export { WorkflowEngine } from './domain/workflow-engine.js'
export type {
  EngineResult,
  RehydratableWorkflow,
  WorkflowFactory,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from './domain/workflow-engine.js'

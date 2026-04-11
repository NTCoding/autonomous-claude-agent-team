export type { BaseWorkflowState } from './domain/workflow-state.js'
export { WorkflowStateError } from './domain/workflow-state.js'

export type { BaseEvent } from './domain/base-event.js'
export { BaseEventSchema } from './domain/base-event.js'

export { EngineEventSchema } from './domain/engine-events.js'
export type {
  EngineEvent,
  SessionStartedEvent,
  TransitionedEvent,
  AgentRegisteredEvent,
  AgentShutDownEvent,
  JournalEntryEvent,
  WriteCheckedEvent,
  BashCheckedEvent,
  PluginReadCheckedEvent,
  IdleCheckedEvent,
  IdentityVerifiedEvent,
  ContextRequestedEvent,
} from './domain/engine-events.js'

export { DomainMetadataEventSchema } from './domain/domain-metadata-events.js'
export type {
  DomainMetadataEvent,
  IssueRecordedEvent,
  BranchRecordedEvent,
  PrRecordedEvent,
} from './domain/domain-metadata-events.js'

export { WorkflowEngine } from './domain/workflow-engine.js'
export type {
  EngineResult,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from './domain/workflow-engine.js'

export type { TranscriptMessage, TranscriptReader } from './domain/transcript-reader.js'
export type { IdentityCheckResult } from './domain/identity-verification.js'
export { checkIdentity } from './domain/identity-verification.js'
export { ClaudeCodeTranscriptReader } from './domain/claude-code-transcript-reader.js'

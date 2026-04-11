export type { BaseWorkflowState } from './domain/workflow-state'
export { WorkflowStateError } from './domain/workflow-state'

export type { BaseEvent } from './domain/base-event'
export { BaseEventSchema } from './domain/base-event'

export { EngineEventSchema } from './domain/engine-events'
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
} from './domain/engine-events'

export { DomainMetadataEventSchema } from './domain/domain-metadata-events'
export type {
  DomainMetadataEvent,
  IssueRecordedEvent,
  BranchRecordedEvent,
  PrRecordedEvent,
} from './domain/domain-metadata-events'

export { WorkflowEngine } from './domain/workflow-engine'
export type {
  EngineResult,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from './domain/workflow-engine'

export type { TranscriptMessage, TranscriptReader } from './domain/transcript-reader'
export type { IdentityCheckResult } from './domain/identity-verification'
export { checkIdentity } from './domain/identity-verification'
export { ClaudeCodeTranscriptReader } from './domain/claude-code-transcript-reader'

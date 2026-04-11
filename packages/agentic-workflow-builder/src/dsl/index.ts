export { pass, fail } from './domain/result'
export type { PreconditionResult } from './domain/result'
export type {
  GitInfo,
  TransitionContext,
  BashForbiddenConfig,
  WorkflowStateDefinition,
  WorkflowRegistry,
} from './domain/types'
export { checkBashCommand } from './domain/bash-enforcement'
export { defineRecordingOps, checkOperationGate } from './domain/recording-ops'
export type { RecordingOpDefinition, RecordingOpResult, RecordingOpsFactory } from './domain/recording-ops'

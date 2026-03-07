export { pass, fail } from './domain/result.js'
export type { PreconditionResult } from './domain/result.js'
export type {
  GitInfo,
  TransitionContext,
  BashForbiddenConfig,
  WorkflowStateDefinition,
  WorkflowRegistry,
} from './domain/types.js'
export { checkBashCommand } from './domain/bash-enforcement.js'
export { defineRecordingOps, checkOperationGate } from './domain/recording-ops.js'
export type { RecordingOpDefinition, RecordingOpResult, RecordingOpsFactory } from './domain/recording-ops.js'

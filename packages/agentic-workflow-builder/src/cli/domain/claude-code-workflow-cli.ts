import type { BaseWorkflowState } from '../../engine/index'
import { ClaudeCodeTranscriptReader } from '../../engine/index'
import type { RehydratableWorkflow } from '../../engine/index'
import type { WorkflowCliConfig } from './workflow-cli'
import { createWorkflowCli } from './workflow-cli'

export type ClaudeCodeWorkflowCliConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
> = Omit<WorkflowCliConfig<TWorkflow, TState, TDeps>, 'transcriptReader'>

export function createClaudeCodeWorkflowCli<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
>(config: ClaudeCodeWorkflowCliConfig<TWorkflow, TState, TDeps>): void {
  createWorkflowCli({ ...config, transcriptReader: new ClaudeCodeTranscriptReader() })
}

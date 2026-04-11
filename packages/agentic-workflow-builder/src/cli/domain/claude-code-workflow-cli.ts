import type { BaseWorkflowState } from '../../engine/index.js'
import { ClaudeCodeTranscriptReader } from '../../engine/index.js'
import type { RehydratableWorkflow } from '../../engine/index.js'
import type { WorkflowCliConfig } from './workflow-cli.js'
import { createWorkflowCli } from './workflow-cli.js'

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

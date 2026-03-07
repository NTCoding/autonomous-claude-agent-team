/* v8 ignore start */
import type { BaseWorkflowState } from '../../engine/index.js'
import type { RehydratableWorkflow, WorkflowEngineDeps } from '../../engine/index.js'
import type { WorkflowRunnerConfig } from './workflow-runner.js'
import { createWorkflowRunner } from './workflow-runner.js'

export function createWorkflowCli<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
>(
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps>,
  buildDeps: () => { engineDeps: WorkflowEngineDeps; workflowDeps: TDeps; readStdin: () => string },
): void {
  const runner = createWorkflowRunner(config)
  try {
    const deps = buildDeps()
    const args = process.argv.slice(2)
    const result = runner(args, deps.engineDeps, deps.workflowDeps, deps.readStdin)
    if (result.output) {
      process.stdout.write(result.output)
    }
    process.exit(result.exitCode)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(message + '\n')
    process.exit(1)
  }
}
/* v8 ignore stop */

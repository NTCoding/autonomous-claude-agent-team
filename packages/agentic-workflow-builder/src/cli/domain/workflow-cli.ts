/* v8 ignore start */
import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BaseWorkflowState } from '../../engine/index.js'
import type { RehydratableWorkflow, WorkflowEngineDeps } from '../../engine/index.js'
import { createStore } from '../../event-store/index.js'
import type { WorkflowRunnerConfig, RunnerResult } from './workflow-runner.js'
import { createWorkflowRunner } from './workflow-runner.js'
import type { PlatformContext } from './platform-context.js'

export type WorkflowCliConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
> = WorkflowRunnerConfig<TWorkflow, TState, TDeps> & {
  readonly buildWorkflowDeps: (platform: PlatformContext) => TDeps
  readonly customRouter?: (command: string, args: readonly string[], platform: PlatformContext) => RunnerResult | undefined
}

function readEnvVar(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function createWorkflowCli<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
>(
  config: WorkflowCliConfig<TWorkflow, TState, TDeps>,
): void {
  const pluginRoot = readEnvVar('CLAUDE_PLUGIN_ROOT')
  const sessionId = readEnvVar('CLAUDE_SESSION_ID')

  const store = createStore(join(pluginRoot, 'workflow.db'))
  const now = () => new Date().toISOString()

  const platformCtx: PlatformContext = {
    getPluginRoot: () => pluginRoot,
    now,
    getSessionId: () => sessionId,
    store,
  }

  const engineDeps: WorkflowEngineDeps = {
    store,
    getPluginRoot: () => pluginRoot,
    getEnvFilePath: () => join(process.env['HOME'] ?? '', '.claude', 'claude.env'),
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    now,
  }

  const workflowDeps = config.buildWorkflowDeps(platformCtx)

  const readStdin = () => readFileSync('/dev/stdin', 'utf8')

  const errorLogPath = join(pluginRoot, 'error.log')

  try {
    const args = process.argv.slice(2)
    const command = args[0]

    if (command !== undefined && config.customRouter !== undefined) {
      const custom = config.customRouter(command, args, platformCtx)
      if (custom !== undefined) {
        if (custom.output) process.stdout.write(custom.output)
        process.exit(custom.exitCode)
        return
      }
    }

    const runner = createWorkflowRunner(config)
    const result = runner(args, engineDeps, workflowDeps, {
      readStdin,
      getSessionId: () => sessionId,
    })

    if (result.output) {
      process.stdout.write(result.output)
    }
    process.exit(result.exitCode)
  } catch (error: unknown) {
    const message = `[${new Date().toISOString()}] ERROR: ${String(error)}\n`
    process.stderr.write(message)
    try {
      appendFileSync(errorLogPath, message)
    } catch {
      // Ignore write failures to error log
    }
    process.exit(1)
  }
}
/* v8 ignore stop */

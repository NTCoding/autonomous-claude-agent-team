import { join } from 'node:path'
import type { BaseWorkflowState, WorkflowEventStore, WorkflowEngineDeps, TranscriptReader } from '../../engine/index'
import type { RehydratableWorkflow } from '../../engine/index'
import type { WorkflowRunnerConfig, RunnerResult } from './workflow-runner'
import { createWorkflowRunner } from './workflow-runner'
import type { PlatformContext } from './platform-context'

export type ProcessDeps = {
  readonly getEnv: (name: string) => string | undefined
  readonly exit: (code: number) => void
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly getArgv: () => readonly string[]
  readonly readFile: (path: string) => string
  readonly appendToFile: (path: string, content: string) => void
  readonly buildStore: (dbPath: string) => WorkflowEventStore
}

export type WorkflowCliConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
> = WorkflowRunnerConfig<TWorkflow, TState, TDeps> & {
  readonly buildWorkflowDeps: (platform: PlatformContext) => TDeps
  readonly customRouter?: (command: string, args: readonly string[], platform: PlatformContext) => RunnerResult | undefined
  readonly processDeps: ProcessDeps
  readonly transcriptReader: TranscriptReader
}

function buildReadEnvVar(getEnv: (name: string) => string | undefined) {
  return function readEnvVar(name: string): string {
    const value = getEnv(name)
    if (value === undefined || value === '') {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
  }
}

export function createWorkflowCli<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState,
  TDeps,
>(
  config: WorkflowCliConfig<TWorkflow, TState, TDeps>,
): void {
  const { processDeps } = config
  const readEnvVar = buildReadEnvVar(processDeps.getEnv)

  const pluginRoot = readEnvVar('CLAUDE_PLUGIN_ROOT')
  const getSessionId = () => readEnvVar('CLAUDE_SESSION_ID')

  const store = processDeps.buildStore(join(pluginRoot, 'workflow.db'))
  const now = () => new Date().toISOString()

  const platformCtx: PlatformContext = {
    getPluginRoot: () => pluginRoot,
    now,
    getSessionId,
    store,
  }

  const engineDeps: WorkflowEngineDeps = {
    store,
    getPluginRoot: () => pluginRoot,
    getEnvFilePath: () => join(readEnvVar('HOME'), '.claude', 'claude.env'),
    readFile: processDeps.readFile,
    appendToFile: processDeps.appendToFile,
    now,
    transcriptReader: config.transcriptReader,
  }

  const workflowDeps = config.buildWorkflowDeps(platformCtx)
  const readStdin = () => processDeps.readFile('/dev/stdin')
  const errorLogPath = join(pluginRoot, 'error.log')

  try {
    const args = processDeps.getArgv().slice(2)
    const command = args[0]

    if (command !== undefined && config.customRouter !== undefined) {
      const custom = config.customRouter(command, args, platformCtx)
      if (custom !== undefined) {
        if (custom.output) processDeps.writeStdout(custom.output)
        processDeps.exit(custom.exitCode)
        return
      }
    }

    const runner = createWorkflowRunner(config)
    const result = runner(args, engineDeps, workflowDeps, {
      readStdin,
      getSessionId,
    })

    if (result.output) {
      processDeps.writeStdout(result.output)
    }
    processDeps.exit(result.exitCode)
  } catch (error: unknown) {
    const message = `[${new Date().toISOString()}] ERROR: ${String(error)}\n`
    processDeps.writeStderr(message)
    try {
      processDeps.appendToFile(errorLogPath, message)
    } catch {
      // Ignore write failures to error log
    }
    processDeps.exit(1)
  }
}

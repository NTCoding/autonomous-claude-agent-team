import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, appendFileSync } from 'node:fs'
import type {
  BaseWorkflowState,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
} from '../../engine/index.js'
import { WorkflowEngine } from '../../engine/index.js'
import type { PlatformContext, PreToolUseHandlerConfig } from '../../cli/index.js'
import { createPreToolUseHandler } from '../../cli/index.js'
import { createStore } from '../../event-store/index.js'
import { OpenCodeTranscriptReader } from './opencode-transcript-reader.js'

type OpenCodeToolBeforeInput = {
  readonly tool: string
  readonly sessionID: string
  readonly callID: string
}

type OpenCodeToolBeforeOutput = {
  args: Record<string, unknown>
}

type OpenCodeHooks = {
  readonly 'tool.execute.before'?: (
    input: OpenCodeToolBeforeInput,
    output: OpenCodeToolBeforeOutput,
  ) => Promise<void>
}

export type OpenCodePlugin = (input?: unknown, options?: unknown) => Promise<OpenCodeHooks>

export type OpenCodeWorkflowPluginConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> = PreToolUseHandlerConfig<TWorkflow, TState, TStateName> & {
  readonly workflowDefinition: WorkflowDefinition<TWorkflow, TState, TDeps, TStateName, TOperation>
  readonly buildWorkflowDeps: (platform: PlatformContext) => TDeps
  readonly pluginRoot: string
  readonly databasePath?: string
}

export function createOpenCodeWorkflowPlugin<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
>(
  config: OpenCodeWorkflowPluginConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
): OpenCodePlugin {
  const store = createStore(join(config.pluginRoot, 'workflow.db'))
  const dbPath = resolveOpenCodeDatabasePath(config.databasePath)

  return async (_input?: unknown, _options?: unknown): Promise<OpenCodeHooks> => ({
    'tool.execute.before': async (input: OpenCodeToolBeforeInput, output: OpenCodeToolBeforeOutput) => {
      const transcriptReader = new OpenCodeTranscriptReader(input.sessionID)
      const now = () => new Date().toISOString()

      const engineDeps: WorkflowEngineDeps = {
        store,
        getPluginRoot: () => config.pluginRoot,
        /* v8 ignore next */
        getEnvFilePath: () => join(homedir(), '.opencode', 'opencode.env'),
        readFile: (path) => readFileSync(path, 'utf8'),
        /* v8 ignore next */
        appendToFile: (path, content) => appendFileSync(path, content),
        now,
        transcriptReader,
      }

      const platformCtx: PlatformContext = {
        getPluginRoot: () => config.pluginRoot,
        now,
        getSessionId: () => input.sessionID,
        store,
      }

      const workflowDeps = config.buildWorkflowDeps(platformCtx)
      const engine = new WorkflowEngine(config.workflowDefinition, engineDeps, workflowDeps)

      if (!engine.hasSession(input.sessionID)) {
        engine.startSession(input.sessionID, dbPath)
      }

      const handler = createPreToolUseHandler({
        bashForbidden: config.bashForbidden,
        isWriteAllowed: config.isWriteAllowed,
        ...(config.customGates !== undefined ? { customGates: config.customGates } : {}),
      })

      const result = handler(engine, input.sessionID, input.tool, output.args)

      if (result.type === 'blocked') {
        throw new Error(result.output)
      }
    },
  })
}

function resolveOpenCodeDatabasePath(configured?: string): string {
  if (configured !== undefined) return configured
  return process.env['OPENCODE_DB'] ?? join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, appendFileSync, readdirSync } from 'node:fs'
import { z } from 'zod'
import type {
  BaseWorkflowState,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
} from '../../engine/index.js'
import { WorkflowEngine } from '../../engine/index.js'
import type { PlatformContext, PreToolUseHandlerConfig, RouteMap } from '../../cli/index.js'
import { createPreToolUseHandler, createWorkflowRunner } from '../../cli/index.js'
import { createStore } from '../../event-store/index.js'
import { OpenCodeTranscriptReader } from './opencode-transcript-reader.js'

const TRANSLATION_NOTE = [
  '> **OpenCode**: When instructions say `/dev-workflow-v2:workflow <op> [args]`, call',
  '> the `workflow` tool instead: `operation: "<op>"`, `args: ["<arg>", ...]`.',
  '> Example: `/dev-workflow-v2:workflow transition REVIEWING`',
  '>   → `workflow({ operation: "transition", args: ["REVIEWING"] })`',
  '',
  '---',
  '',
  '',
].join('\n')

function injectTranslationNote(content: string): string {
  return `${TRANSLATION_NOTE}${content}`
}

type OpenCodeToolBeforeInput = {
  readonly tool: string
  readonly sessionID: string
  readonly callID: string
}

type OpenCodeToolBeforeOutput = {
  args: Record<string, unknown>
}

type OpenCodeToolDefinition = {
  readonly description: string
  readonly args: Record<string, z.ZodType>
  readonly execute: (args: Record<string, unknown>, ctx: { sessionID: string }) => Promise<string>
}

type OpenCodeCommandDefinition = {
  readonly description: string
  readonly content: string
}

type OpenCodeHooks = {
  readonly 'tool.execute.before'?: (
    input: OpenCodeToolBeforeInput,
    output: OpenCodeToolBeforeOutput,
  ) => Promise<void>
  readonly tool?: Record<string, OpenCodeToolDefinition>
  readonly command?: Record<string, OpenCodeCommandDefinition>
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
  readonly routes?: RouteMap<TWorkflow, TState>
  readonly commandDirectories?: readonly string[]
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

  function buildEngineContext(sessionID: string): {
    engineDeps: WorkflowEngineDeps
    workflowDeps: TDeps
  } {
    const transcriptReader = new OpenCodeTranscriptReader(sessionID)
    const now = () => new Date().toISOString()
    const rawReadFile = (path: string) => readFileSync(path, 'utf8')
    const readFile = config.routes !== undefined
      ? (path: string) => injectTranslationNote(rawReadFile(path))
      : rawReadFile

    const engineDeps: WorkflowEngineDeps = {
      store,
      getPluginRoot: () => config.pluginRoot,
      /* v8 ignore next */
      getEnvFilePath: () => join(homedir(), '.opencode', 'opencode.env'),
      readFile,
      /* v8 ignore next */
      appendToFile: (path, content) => appendFileSync(path, content),
      now,
      transcriptReader,
    }

    const platformCtx: PlatformContext = {
      getPluginRoot: () => config.pluginRoot,
      now,
      getSessionId: () => sessionID,
      store,
    }

    return { engineDeps, workflowDeps: config.buildWorkflowDeps(platformCtx) }
  }

  return async (_input?: unknown, _options?: unknown): Promise<OpenCodeHooks> => {
    const handler = createPreToolUseHandler({
      bashForbidden: config.bashForbidden,
      isWriteAllowed: config.isWriteAllowed,
      ...(config.customGates !== undefined ? { customGates: config.customGates } : {}),
    })

    const toolExecuteBefore = async (input: OpenCodeToolBeforeInput, output: OpenCodeToolBeforeOutput): Promise<void> => {
      const { engineDeps, workflowDeps } = buildEngineContext(input.sessionID)
      const engine = new WorkflowEngine(config.workflowDefinition, engineDeps, workflowDeps)

      if (config.routes !== undefined) {
        // With routes: the workflow tool handles session init via explicit `workflow init` call.
        // Skip enforcement until a session exists.
        if (!engine.hasSession(input.sessionID)) {
          return
        }
      } else {
        // Without routes (enforcement-only): auto-init the session.
        if (!engine.hasSession(input.sessionID)) {
          engine.startSession(input.sessionID, dbPath)
        }
      }

      const result = handler(engine, input.sessionID, input.tool, output.args)

      if (result.type === 'blocked') {
        throw new Error(result.output)
      }
    }

    if (config.routes === undefined) {
      return { 'tool.execute.before': toolExecuteBefore }
    }

    const workflowTool: OpenCodeToolDefinition = {
      description: 'Execute a workflow operation (init, transition, record-*)',
      args: {
        operation: z.string().describe('operation name, e.g. "init", "transition", "record-issue"'),
        args: z.array(z.string()).optional().describe('operation arguments'),
      },
      execute: async (rawArgs, ctx) => {
        const operation = String(rawArgs['operation'] ?? '')
        const argList = Array.isArray(rawArgs['args']) ? (rawArgs['args'] as string[]) : []
        const { engineDeps, workflowDeps } = buildEngineContext(ctx.sessionID)
        const runner = createWorkflowRunner({
          workflowDefinition: config.workflowDefinition,
          routes: config.routes!,
          bashForbidden: config.bashForbidden,
          isWriteAllowed: config.isWriteAllowed,
          ...(config.customGates !== undefined ? { customGates: config.customGates } : {}),
        })
        const result = runner(
          [operation, ...argList],
          engineDeps,
          workflowDeps,
          { getSessionId: () => ctx.sessionID },
        )
        return result.output
      },
    }

    const commands = loadCommands(config.commandDirectories ?? [])

    return {
      'tool.execute.before': toolExecuteBefore,
      tool: { workflow: workflowTool },
      ...(Object.keys(commands).length > 0 ? { command: commands } : {}),
    }
  }
}

function loadCommands(commandDirectories: readonly string[]): Record<string, OpenCodeCommandDefinition> {
  const commands: Record<string, OpenCodeCommandDefinition> = {}
  for (const dir of commandDirectories) {
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const name = basename(file, extname(file))
      const filePath = join(dir, file)
      const content = readFileSync(filePath, 'utf8')
      commands[name] = {
        description: `Workflow command: ${name}`,
        content: injectTranslationNote(content),
      }
    }
  }
  return commands
}

function resolveOpenCodeDatabasePath(configured?: string): string {
  if (configured !== undefined) return configured
  return process.env['OPENCODE_DB'] ?? join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

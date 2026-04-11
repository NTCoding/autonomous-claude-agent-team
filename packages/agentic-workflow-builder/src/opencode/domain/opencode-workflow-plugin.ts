import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, appendFileSync, readdirSync } from 'node:fs'
import type { Config as OpenCodeConfig, Hooks, Plugin } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type {
  BaseWorkflowState,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
} from '../../engine/index'
import { WorkflowEngine } from '../../engine/index'
import type { PlatformContext, PreToolUseHandlerConfig, RouteMap } from '../../cli/index'
import { createPreToolUseHandler, createWorkflowRunner } from '../../cli/index'
import { createStore } from '../../event-store/index'
import { OpenCodeTranscriptReader } from './opencode-transcript-reader'

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

type OpenCodeToolExecuteBefore = NonNullable<Hooks['tool.execute.before']>
type OpenCodeToolBeforeInput = Parameters<OpenCodeToolExecuteBefore>[0]
type OpenCodeToolBeforeOutput = Parameters<OpenCodeToolExecuteBefore>[1]
type OpenCodeCommandMap = NonNullable<OpenCodeConfig['command']>
type OpenCodePluginInput = Parameters<Plugin>[0]
type OpenCodePluginOptions = Parameters<Plugin>[1]

export type OpenCodePlugin = (
  input?: OpenCodePluginInput,
  options?: OpenCodePluginOptions,
) => Promise<Hooks>

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
  readonly commandPrefix?: string
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
  const store = createStore(resolveWorkflowEventsDatabasePath())
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

  return async (_input?: OpenCodePluginInput, _options?: OpenCodePluginOptions): Promise<Hooks> => {
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
        // Skip enforcement until the session-started lifecycle event exists.
        if (!engine.hasSessionStarted(input.sessionID)) {
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

    const workflowTool = tool({
      description: 'Execute a workflow operation (init, transition, record-*)',
      args: {
        operation: tool.schema
          .string()
          .describe('operation name, e.g. "init", "transition", "record-issue"'),
        args: tool.schema.array(tool.schema.string()).optional().describe('operation arguments'),
      },
      execute: async (rawArgs, ctx) => {
        const operation = rawArgs.operation
        const argList = rawArgs.args ?? []
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
          {
            getSessionId: () => ctx.sessionID,
            getSessionTranscriptPath: () => dbPath,
          },
        )
        return result.output
      },
    })

    const commands = loadCommands(config.commandDirectories ?? [], config.commandPrefix ?? '')

    return {
      'tool.execute.before': toolExecuteBefore,
      tool: { workflow: workflowTool },
      ...(Object.keys(commands).length > 0
        ? {
            config: async (openCodeConfig) => {
              registerCommands(openCodeConfig, commands)
            },
          }
        : {}),
    }
  }
}

function loadCommands(
  commandDirectories: readonly string[],
  commandPrefix: string,
): OpenCodeCommandMap {
  const commands: OpenCodeCommandMap = {}
  for (const dir of commandDirectories) {
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const baseName = basename(file, extname(file))
      const name = `${commandPrefix}${baseName}`
      if (commands[name] !== undefined) continue
      const filePath = join(dir, file)
      const content = readFileSync(filePath, 'utf8')
      commands[name] = {
        description: `Workflow command: ${name}`,
        template: injectTranslationNote(content),
      }
    }
  }
  return commands
}

function registerCommands(config: OpenCodeConfig, commands: OpenCodeCommandMap): void {
  if (config.command === undefined) {
    config.command = {}
  }

  for (const [name, command] of Object.entries(commands)) {
    if (config.command[name] !== undefined) {
      continue
    }
    config.command[name] = command
  }
}

function resolveOpenCodeDatabasePath(configured?: string): string {
  if (configured !== undefined) return configured
  return process.env['OPENCODE_DB'] ?? join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

function resolveWorkflowEventsDatabasePath(): string {
  const configured = process.env['WORKFLOW_EVENTS_DB']
  if (configured !== undefined && configured !== '') return configured
  return join(homedir(), '.workflow-events.db')
}

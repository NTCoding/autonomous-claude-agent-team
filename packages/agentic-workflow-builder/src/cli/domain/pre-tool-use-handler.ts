import type { WorkflowEngine, EngineResult, BaseWorkflowState, RehydratableWorkflow } from '../../engine/index.js'
import type { BashForbiddenConfig } from '../../dsl/index.js'

export type PreToolUseHandlerFn<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> = (
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
) => EngineResult

export type CustomPreToolUseGate<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TStateName extends string = string,
> = {
  readonly name: string
  readonly check: (workflow: TWorkflow, ctx: { readonly toolName: string; readonly filePath: string; readonly command: string }) => true | string
}

export type PreToolUseHandlerConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TStateName extends string = string,
> = {
  readonly bashForbidden: BashForbiddenConfig
  readonly isWriteAllowed: (filePath: string, state: TState) => boolean
  readonly customGates?: readonly CustomPreToolUseGate<TWorkflow, TState, TStateName>[]
}

export function createPreToolUseHandler<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
>(
  config: PreToolUseHandlerConfig<TWorkflow, TState, TStateName>,
): PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation> {
  return (engine, sessionId, toolName, toolInput) => {
    const filePath = extractFilePath(toolInput)
    const command = extractCommand(toolInput)
    const ctx = { toolName, filePath, command }

    for (const gate of config.customGates ?? []) {
      const result = engine.transaction(
        sessionId,
        `hook:${gate.name}`,
        (w) => {
          const check = gate.check(w, ctx)
          if (check === true) return { pass: true as const }
          return { pass: false as const, reason: check }
        },
      )
      if (result.type === 'blocked') return result
    }

    const writeCheck = engine.checkWrite(sessionId, toolName, filePath, config.isWriteAllowed)
    if (writeCheck.type === 'blocked') return writeCheck

    return engine.checkBash(sessionId, toolName, command, config.bashForbidden)
  }
}

function extractFilePath(toolInput: Record<string, unknown>): string {
  return resolveStringField(toolInput['file_path'])
    || resolveStringField(toolInput['path'])
    || resolveStringField(toolInput['pattern'])
}

function extractCommand(toolInput: Record<string, unknown>): string {
  return resolveStringField(toolInput['command'])
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new Error(`Expected string or undefined in tool_input field. Got ${typeof value}: ${String(value)}`)
}

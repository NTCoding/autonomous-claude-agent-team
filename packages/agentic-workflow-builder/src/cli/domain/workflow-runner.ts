import type { BaseWorkflowState } from '../../engine/index'
import { WorkflowEngine } from '../../engine/index'
import type {
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
  EngineResult,
} from '../../engine/index'
import type { BashForbiddenConfig } from '../../dsl/index'
import type { ArgParser } from './arg-helpers'
import type { RouteMap } from './command-definition'
import type { PreToolUseInput, SubagentStartInput, TeammateIdleInput } from './hook-schemas'
import { EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from './exit-codes'
import { HookCommonInputSchema, PreToolUseInputSchema, SubagentStartInputSchema, TeammateIdleInputSchema } from './hook-schemas'
import { formatDenyDecision, formatContextInjection } from './hook-output'
import type { PreToolUseHandlerFn, CustomPreToolUseGate } from './pre-tool-use-handler'
import { createPreToolUseHandler } from './pre-tool-use-handler'

export type RunnerResult = { readonly output: string; readonly exitCode: number }

export type { PreToolUseHandlerFn } from './pre-tool-use-handler'

export type RunnerOptions = {
  readonly readStdin?: () => string
  readonly getSessionId?: () => string
}

export type WorkflowRunnerConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> = {
  readonly workflowDefinition: WorkflowDefinition<TWorkflow, TState, TDeps, TStateName, TOperation>
  readonly routes: RouteMap<TWorkflow, TState>
  readonly bashForbidden?: BashForbiddenConfig
  readonly isWriteAllowed?: (filePath: string, state: TState) => boolean
  readonly customGates?: readonly CustomPreToolUseGate<TWorkflow, TState, TStateName>[]
  readonly preToolUseHandler?: PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation>
}

function resolvePreToolUseHandler<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
): PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation> | undefined {
  const hasPolicy = config.bashForbidden !== undefined
    || config.isWriteAllowed !== undefined
    || config.customGates !== undefined

  if (config.preToolUseHandler !== undefined) {
    if (hasPolicy) {
      throw new Error(
        'WorkflowRunnerConfig: preToolUseHandler is mutually exclusive with bashForbidden/isWriteAllowed/customGates. '
        + 'Provide either policy fields (default path) or a custom handler (escape hatch), not both.',
      )
    }
    return config.preToolUseHandler
  }

  if (config.bashForbidden === undefined && config.isWriteAllowed === undefined) {
    if (config.customGates !== undefined) {
      throw new Error(
        'WorkflowRunnerConfig: customGates requires bashForbidden and isWriteAllowed to also be set.',
      )
    }
    return undefined
  }

  if (config.bashForbidden === undefined || config.isWriteAllowed === undefined) {
    throw new Error(
      'WorkflowRunnerConfig: bashForbidden and isWriteAllowed must be provided together.',
    )
  }

  const handlerConfig = config.customGates === undefined
    ? {
        bashForbidden: config.bashForbidden,
        isWriteAllowed: config.isWriteAllowed,
      }
    : {
        bashForbidden: config.bashForbidden,
        isWriteAllowed: config.isWriteAllowed,
        customGates: config.customGates,
      }
  return createPreToolUseHandler<TWorkflow, TState, TDeps, TStateName, TOperation>(handlerConfig)
}

function engineResultToRunnerResult(result: EngineResult): RunnerResult {
  switch (result.type) {
    case 'success':
      return { output: result.output, exitCode: EXIT_ALLOW }
    case 'blocked':
      return { output: result.output, exitCode: EXIT_BLOCK }
    /* v8 ignore next 2 */
    case 'error':
      return { output: result.output, exitCode: EXIT_ERROR }
  }
}

function parseArgs(
  argParsers: readonly ArgParser<unknown>[] | undefined,
  args: readonly string[],
  routeName: string,
): { readonly ok: true; readonly values: readonly unknown[] } | { readonly ok: false; readonly message: string } {
  const values: unknown[] = []
  /* v8 ignore next */
  for (const [i, parser] of (argParsers ?? []).entries()) {
    const result = parser.parse(args, i + 1, routeName)
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    values.push(result.value)
  }
  return { ok: true, values }
}

function assertSessionId(values: readonly unknown[]): string {
  const id = values[0]
  /* v8 ignore next */
  if (typeof id !== 'string') throw new Error('session-id argument must be a string')
  return id
}

function assertTarget(values: readonly unknown[]): string {
  const target = values[1]
  /* v8 ignore next */
  if (typeof target !== 'string') throw new Error('target argument must be a string')
  return target
}

export function createWorkflowRunner<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
>(
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
): (args: readonly string[], engineDeps: WorkflowEngineDeps, workflowDeps: TDeps, options?: RunnerOptions) => RunnerResult {
  const resolvedHandler = resolvePreToolUseHandler(config)
  return (args, engineDeps, workflowDeps, options) => {
    const engine = new WorkflowEngine(config.workflowDefinition, engineDeps, workflowDeps)
    const routeName = args[0]

    if (routeName !== undefined) {
      return handleRoute(engine, config, args, routeName, options?.getSessionId)
    }

    if (options?.readStdin === undefined) {
      return { output: 'No command and no stdin available', exitCode: EXIT_ERROR }
    }

    return handleHook(engine, config, resolvedHandler, options.readStdin)
  }
}

function handleRoute<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  args: readonly string[],
  routeName: string,
  getSessionId?: () => string,
): RunnerResult {
  const routeDef = config.routes[routeName]
  if (routeDef === undefined) {
    return { output: `Unknown command: ${routeName}`, exitCode: EXIT_ERROR }
  }

  const parsedArgs = parseArgs(routeDef.args, args, routeName)
  if (!parsedArgs.ok) {
    return { output: parsedArgs.message, exitCode: EXIT_ERROR }
  }

  const resolveSessionId = (): string => {
    if (getSessionId !== undefined) return getSessionId()
    return assertSessionId(parsedArgs.values)
  }

  const argsAfterSessionId = (): readonly unknown[] => {
    if (getSessionId !== undefined) return parsedArgs.values
    return parsedArgs.values.slice(1)
  }

  const resolveTarget = (): string => {
    if (getSessionId !== undefined) {
      const target = parsedArgs.values[0]
      /* v8 ignore next */
      if (typeof target !== 'string') throw new Error('target argument must be a string')
      return target
    }
    return assertTarget(parsedArgs.values)
  }

  switch (routeDef.type) {
    case 'session-start': {
      const sessionId = resolveSessionId()
      const result = engine.startSession(sessionId, '')
      return engineResultToRunnerResult(result)
    }
    case 'transition': {
      const sessionId = resolveSessionId()
      const target = config.workflowDefinition.stateSchema.parse(resolveTarget())
      const result = engine.transition(sessionId, target)
      return engineResultToRunnerResult(result)
    }
    case 'transaction': {
      const sessionId = resolveSessionId()
      const restArgs = argsAfterSessionId()
      const result = engine.transaction(
        sessionId,
        routeName,
        (w: TWorkflow) => routeDef.handler(w, ...restArgs),
      )
      return engineResultToRunnerResult(result)
    }
  }
}

function handleHook<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  resolvedHandler: PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation> | undefined,
  readStdin: () => string,
): RunnerResult {
  const stdin = readStdin()
  const commonParse = HookCommonInputSchema.safeParse(JSON.parse(stdin))
  if (!commonParse.success) {
    return { output: `Invalid hook input: ${commonParse.error.message}`, exitCode: EXIT_ERROR }
  }
  const common = commonParse.data

  if (common.hook_event_name === 'SessionStart') {
    const result = engine.startSession(common.session_id, common.transcript_path)
    engine.persistSessionId(common.session_id)
    return engineResultToRunnerResult(result)
  }

  if (!engine.hasSession(common.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  switch (common.hook_event_name) {
    case 'PreToolUse':
      return handlePreToolUseHook(engine, resolvedHandler, stdin)
    case 'SubagentStart':
      return handleSubagentStartHook(engine, stdin)
    case 'TeammateIdle':
      return handleTeammateIdleHook(engine, stdin)
    default:
      return { output: '', exitCode: EXIT_ALLOW }
  }
}

function handlePreToolUseHook<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  resolvedHandler: PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation> | undefined,
  stdin: string,
): RunnerResult {
  const toolParse = PreToolUseInputSchema.safeParse(JSON.parse(stdin))
  if (!toolParse.success) {
    return { output: `Invalid pre-tool-use input: ${toolParse.error.message}`, exitCode: EXIT_ERROR }
  }
  return handlePreToolUse(engine, resolvedHandler, toolParse.data)
}

function handlePreToolUse<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  resolvedHandler: PreToolUseHandlerFn<TWorkflow, TState, TDeps, TStateName, TOperation> | undefined,
  input: PreToolUseInput,
): RunnerResult {
  if (resolvedHandler === undefined) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const result = resolvedHandler(engine, input.session_id, input.tool_name, input.tool_input)
  if (result.type === 'blocked') {
    return { output: formatDenyDecision(result.output), exitCode: EXIT_BLOCK }
  }
  return engineResultToRunnerResult(result)
}

function handleSubagentStartHook<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  stdin: string,
): RunnerResult {
  const parsed = SubagentStartInputSchema.safeParse(JSON.parse(stdin))
  if (!parsed.success) {
    return { output: `Invalid subagent-start input: ${parsed.error.message}`, exitCode: EXIT_ERROR }
  }
  const input: SubagentStartInput = parsed.data

  const result = engine.transaction(
    input.session_id,
    'register-agent',
    (w: TWorkflow) => w.registerAgent(input.agent_type, input.agent_id),
  )

  /* v8 ignore next */
  const contextOutput = result.type === 'success' ? result.output : ''
  return { output: formatContextInjection(contextOutput), exitCode: EXIT_ALLOW }
}

function handleTeammateIdleHook<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  stdin: string,
): RunnerResult {
  const parsed = TeammateIdleInputSchema.safeParse(JSON.parse(stdin))
  if (!parsed.success) {
    return { output: `Invalid teammate-idle input: ${parsed.error.message}`, exitCode: EXIT_ERROR }
  }
  const input: TeammateIdleInput = parsed.data
  const agentName = input.teammate_name ?? ''

  const result = engine.transaction(
    input.session_id,
    'check-idle',
    (w: TWorkflow) => w.handleTeammateIdle(agentName),
  )

  return engineResultToRunnerResult(result)
}

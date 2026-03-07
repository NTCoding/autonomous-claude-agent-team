import type { BaseWorkflowState } from '../../engine/index.js'
import { WorkflowEngine } from '../../engine/index.js'
import type {
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
  EngineResult,
} from '../../engine/index.js'
import type { ArgParser } from './arg-helpers.js'
import type { RouteMap } from './command-definition.js'
import type { HookDefinition } from './hook-definition.js'
import type { PreToolUseInput, SubagentStartInput, TeammateIdleInput } from './hook-schemas.js'
import { EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from './exit-codes.js'
import { HookCommonInputSchema, PreToolUseInputSchema, SubagentStartInputSchema, TeammateIdleInputSchema } from './hook-schemas.js'

export type RunnerResult = { readonly output: string; readonly exitCode: number }

export type WorkflowRunnerConfig<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> = {
  readonly workflowDefinition: WorkflowDefinition<TWorkflow, TState, TDeps, TStateName, TOperation>
  readonly routes: RouteMap<TWorkflow, TState>
  readonly hooks?: HookDefinition<TWorkflow>
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
): (args: readonly string[], engineDeps: WorkflowEngineDeps, workflowDeps: TDeps, readStdin?: () => string) => RunnerResult {
  return (args, engineDeps, workflowDeps, readStdin) => {
    const engine = new WorkflowEngine(config.workflowDefinition, engineDeps, workflowDeps)
    const routeName = args[0]

    if (routeName !== undefined) {
      return handleRoute(engine, config, args, routeName)
    }

    if (readStdin === undefined) {
      return { output: 'No command and no stdin available', exitCode: EXIT_ERROR }
    }

    return handleHook(engine, config, readStdin)
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
): RunnerResult {
  const routeDef = config.routes[routeName]
  if (routeDef === undefined) {
    return { output: `Unknown command: ${routeName}`, exitCode: EXIT_ERROR }
  }

  const parsedArgs = parseArgs(routeDef.args, args, routeName)
  if (!parsedArgs.ok) {
    return { output: parsedArgs.message, exitCode: EXIT_ERROR }
  }

  switch (routeDef.type) {
    case 'session-start': {
      const sessionId = assertSessionId(parsedArgs.values)
      const result = engine.startSession(sessionId)
      return engineResultToRunnerResult(result)
    }
    case 'transition': {
      const sessionId = assertSessionId(parsedArgs.values)
      const target = config.workflowDefinition.parseStateName(assertTarget(parsedArgs.values))
      const result = engine.transition(sessionId, target)
      return engineResultToRunnerResult(result)
    }
    case 'transaction': {
      const sessionId = assertSessionId(parsedArgs.values)
      const restArgs = parsedArgs.values.slice(1)
      const result = engine.transaction(sessionId, routeName, (w: TWorkflow) =>
        routeDef.handler(w, ...restArgs),
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
      return handlePreToolUseHook(engine, config, stdin)
    case 'SubagentStart':
      return handleSubagentStartHook(engine, config, stdin)
    case 'TeammateIdle':
      return handleTeammateIdleHook(engine, config, stdin)
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
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  stdin: string,
): RunnerResult {
  const toolParse = PreToolUseInputSchema.safeParse(JSON.parse(stdin))
  if (!toolParse.success) {
    return { output: `Invalid pre-tool-use input: ${toolParse.error.message}`, exitCode: EXIT_ERROR }
  }
  return handlePreToolUse(engine, config, toolParse.data)
}

function handlePreToolUse<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  input: PreToolUseInput,
): RunnerResult {
  if (config.hooks?.preToolUse === undefined) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  if (!engine.hasSession(input.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const hookCheck = config.hooks.preToolUse[input.tool_name]
  if (hookCheck === undefined) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const extracted = hookCheck.extract(input.tool_input)
  const result = engine.transaction(
    input.session_id,
    `hook:${input.tool_name}`,
    (w: TWorkflow) => hookCheck.check(w, extracted, input.tool_name),
    input.transcript_path,
  )

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
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  stdin: string,
): RunnerResult {
  const handler = config.hooks?.subagentStart
  if (handler === undefined) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const parsed = SubagentStartInputSchema.safeParse(JSON.parse(stdin))
  if (!parsed.success) {
    return { output: `Invalid subagent-start input: ${parsed.error.message}`, exitCode: EXIT_ERROR }
  }
  const input = parsed.data

  const result = engine.transaction(
    input.session_id,
    'register-agent',
    (w: TWorkflow) => handler.register(w, input.agent_type, input.agent_id),
  )

  return engineResultToRunnerResult(result)
}

function handleTeammateIdleHook<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string,
  TOperation extends string,
>(
  engine: WorkflowEngine<TWorkflow, TState, TDeps, TStateName, TOperation>,
  config: WorkflowRunnerConfig<TWorkflow, TState, TDeps, TStateName, TOperation>,
  stdin: string,
): RunnerResult {
  const handler = config.hooks?.teammateIdle
  if (handler === undefined) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const parsed = TeammateIdleInputSchema.safeParse(JSON.parse(stdin))
  if (!parsed.success) {
    return { output: `Invalid teammate-idle input: ${parsed.error.message}`, exitCode: EXIT_ERROR }
  }
  const input = parsed.data
  const agentName = input.teammate_name ?? ''

  const result = engine.transaction(
    input.session_id,
    'check-idle',
    (w: TWorkflow) => handler.check(w, agentName),
  )

  return engineResultToRunnerResult(result)
}

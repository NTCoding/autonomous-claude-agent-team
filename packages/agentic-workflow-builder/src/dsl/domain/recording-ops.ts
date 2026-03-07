import type { PreconditionResult } from './result.js'
import { pass, fail } from './result.js'
import type { WorkflowRegistry } from './types.js'

export function checkOperationGate<
  TStateName extends string,
  TState extends { currentStateMachineState: TStateName },
  TOperation extends string,
>(
  op: TOperation,
  state: TState,
  registry: WorkflowRegistry<TState, TStateName, TOperation>,
): PreconditionResult {
  const stateName = state.currentStateMachineState
  const stateDef = registry[stateName]
  if (stateDef.allowedWorkflowOperations.includes(op)) {
    return pass()
  }
  return fail(`${op} is not allowed in state ${state.currentStateMachineState}.`)
}

export type RecordingOpDefinition<TArgs extends readonly unknown[]> = {
  readonly event: string
  readonly payload: (...args: TArgs) => Record<string, unknown>
}

export type RecordingOpResult =
  | { readonly pass: true; readonly event: { readonly type: string; readonly at: string } & Record<string, unknown> }
  | { readonly pass: false; readonly reason: string }

export type RecordingOpsFactory<
  TStateName extends string,
  TState extends { currentStateMachineState: TStateName },
  TOperation extends string,
> = {
  readonly executeOp: (
    opName: TOperation,
    state: TState,
    now: string,
    args: readonly unknown[],
  ) => RecordingOpResult
}

export function defineRecordingOps<
  TStateName extends string,
  TState extends { currentStateMachineState: TStateName },
  TOperation extends string,
>(
  registry: WorkflowRegistry<TState, TStateName, TOperation>,
  ops: { readonly [K in string]: RecordingOpDefinition<readonly never[]> },
): RecordingOpsFactory<TStateName, TState, TOperation> {
  return {
    executeOp: (
      opName: TOperation,
      state: TState,
      now: string,
      args: readonly unknown[],
    ): RecordingOpResult => {
      const gate = checkOperationGate(opName, state, registry)
      if (!gate.pass) return { pass: false, reason: gate.reason }
      const opDef = ops[opName]
      if (opDef === undefined) {
        return { pass: false, reason: `Unknown recording operation: ${opName}` }
      }
      const payload = opDef.payload(...(args as readonly never[]))
      return { pass: true, event: { type: opDef.event, at: now, ...payload } }
    },
  }
}

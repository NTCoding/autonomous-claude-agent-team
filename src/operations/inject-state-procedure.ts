import type { WorkflowState } from '../domain/workflow-state.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import { getProcedurePath } from '../domain/state-procedure-map.js'
import { formatContextInjection, EXIT_ALLOW } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type InjectStateProcedureDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly readFile: (path: string) => string
  readonly getPluginRoot: () => string
}

export function runInjectStateProcedure(
  sessionId: string,
  hookInput: PreToolUseInput,
  deps: InjectStateProcedureDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)
  const procedurePath = getProcedurePath(state.state, deps.getPluginRoot())
  const procedureContent = deps.readFile(procedurePath)
  const context = buildStateContext(state, procedureContent)
  return { output: formatContextInjection(context), exitCode: EXIT_ALLOW }
}

function buildStateContext(state: WorkflowState, procedureContent: string): string {
  const taskLine = state.currentIterationTask
    ? `\nCurrent task: ${state.currentIterationTask}\n`
    : ''
  return `Current workflow state: ${state.state}${taskLine}\n\nProcedure:\n${procedureContent}`
}

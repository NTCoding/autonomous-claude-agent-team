import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'
import { createEventEntry } from '../domain/event-log.js'
import { getProcedurePath } from '../domain/state-procedure-map.js'
import { formatInitSuccess } from '../domain/output-guidance.js'
import { EXIT_ALLOW } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type InitDeps = {
  readonly stateFileExists: (path: string) => boolean
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly readFile: (path: string) => string
  readonly getPluginRoot: () => string
  readonly now: () => string
}

export function runInit(sessionId: string, deps: InitDeps): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }
  const state: WorkflowState = {
    ...INITIAL_STATE,
    eventLog: [createEventEntry('init', deps.now())],
  }
  deps.writeState(statePath, state)
  const procedurePath = getProcedurePath('SPAWN', deps.getPluginRoot())
  const procedureContent = deps.readFile(procedurePath)
  return { output: formatInitSuccess(procedureContent), exitCode: EXIT_ALLOW }
}

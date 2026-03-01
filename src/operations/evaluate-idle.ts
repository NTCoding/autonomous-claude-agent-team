import type { WorkflowState } from '../domain/workflow-state.js'
import type { TeammateIdleInput } from '../infra/hook-io.js'
import { checkIdleAllowed } from '../domain/hook-rules.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type EvaluateIdleDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
}

export function runEvaluateIdle(
  sessionId: string,
  hookInput: TeammateIdleInput,
  deps: EvaluateIdleDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)
  const agentName = hookInput.teammate_name ?? ''
  const decision = checkIdleAllowed(state, agentName)

  if (!decision.allow) {
    return { output: decision.reason, exitCode: EXIT_BLOCK }
  }

  return { output: '', exitCode: EXIT_ALLOW }
}

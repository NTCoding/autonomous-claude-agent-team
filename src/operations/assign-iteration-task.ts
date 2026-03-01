import type { WorkflowState } from '../domain/workflow-state.js'
import { checkOperationGate } from '../domain/operation-gates.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatOperationSuccess, formatOperationGateError } from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type AssignIterationTaskDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
}

export function runAssignIterationTask(
  sessionId: string,
  task: string,
  deps: AssignIterationTaskDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const gateResult = checkOperationGate('assign-iteration-task', state.state)

  if (!gateResult.pass) {
    return {
      output: formatOperationGateError('assign-iteration-task', gateResult.reason),
      exitCode: EXIT_BLOCK,
    }
  }

  const updatedState: WorkflowState = {
    ...state,
    currentIterationTask: task,
    eventLog: [
      ...state.eventLog,
      createEventEntry('assign-iteration-task', deps.now(), { task }),
    ],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: formatOperationSuccess('assign-iteration-task', updatedState),
    exitCode: EXIT_ALLOW,
  }
}

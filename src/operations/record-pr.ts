import type { WorkflowState } from '../domain/workflow-state.js'
import { checkOperationGate } from '../domain/operation-gates.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatOperationSuccess, formatOperationGateError } from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type RecordPrDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
}

export function runRecordPr(
  sessionId: string,
  prNumber: number,
  deps: RecordPrDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const gateResult = checkOperationGate('record-pr', state.state)

  if (!gateResult.pass) {
    return {
      output: formatOperationGateError('record-pr', gateResult.reason),
      exitCode: EXIT_BLOCK,
    }
  }

  const updatedState: WorkflowState = {
    ...state,
    prNumber,
    eventLog: [
      ...state.eventLog,
      createEventEntry('record-pr', deps.now(), { pr: prNumber }),
    ],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: formatOperationSuccess('record-pr', updatedState),
    exitCode: EXIT_ALLOW,
  }
}

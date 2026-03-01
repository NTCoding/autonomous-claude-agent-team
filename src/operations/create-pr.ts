import type { WorkflowState } from '../domain/workflow-state.js'
import { checkOperationGate } from '../domain/operation-gates.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatOperationSuccess, formatOperationGateError } from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type CreatePrDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
  readonly createDraftPr: (title: string, body: string) => number
}

export function runCreatePr(
  sessionId: string,
  title: string,
  body: string,
  deps: CreatePrDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const gateResult = checkOperationGate('create-pr', state.state)

  if (!gateResult.pass) {
    return {
      output: formatOperationGateError('create-pr', gateResult.reason),
      exitCode: EXIT_BLOCK,
    }
  }

  const prNumber = deps.createDraftPr(title, body)
  const updatedState: WorkflowState = {
    ...state,
    prNumber,
    eventLog: [
      ...state.eventLog,
      createEventEntry('create-pr', deps.now(), { pr: prNumber }),
    ],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: formatOperationSuccess('create-pr', updatedState),
    exitCode: EXIT_ALLOW,
  }
}

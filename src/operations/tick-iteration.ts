import type { WorkflowState } from '../domain/workflow-state.js'
import { checkOperationGate } from '../domain/operation-gates.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatOperationSuccess, formatOperationGateError } from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type TickIterationDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
  readonly tickFirstUncheckedIteration: (issueNumber: number) => void
}

export function runTickIteration(
  sessionId: string,
  issueNumber: number,
  deps: TickIterationDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const gateResult = checkOperationGate('tick-iteration', state.state)

  if (!gateResult.pass) {
    return {
      output: formatOperationGateError('tick-iteration', gateResult.reason),
      exitCode: EXIT_BLOCK,
    }
  }

  deps.tickFirstUncheckedIteration(issueNumber)
  const updatedState: WorkflowState = {
    ...state,
    eventLog: [
      ...state.eventLog,
      createEventEntry('tick-iteration', deps.now(), { issue: issueNumber }),
    ],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: formatOperationSuccess('tick-iteration', updatedState),
    exitCode: EXIT_ALLOW,
  }
}

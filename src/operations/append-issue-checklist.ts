import type { WorkflowState } from '../domain/workflow-state.js'
import { checkOperationGate } from '../domain/operation-gates.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatOperationSuccess, formatOperationGateError } from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type AppendIssueChecklistDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
  readonly appendIssueChecklist: (issueNumber: number, checklist: string) => void
}

export function runAppendIssueChecklist(
  sessionId: string,
  issueNumber: number,
  checklist: string,
  deps: AppendIssueChecklistDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const gateResult = checkOperationGate('append-issue-checklist', state.state)

  if (!gateResult.pass) {
    return {
      output: formatOperationGateError('append-issue-checklist', gateResult.reason),
      exitCode: EXIT_BLOCK,
    }
  }

  deps.appendIssueChecklist(issueNumber, checklist)
  const updatedState: WorkflowState = {
    ...state,
    eventLog: [
      ...state.eventLog,
      createEventEntry('append-issue-checklist', deps.now(), { issue: issueNumber }),
    ],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: formatOperationSuccess('append-issue-checklist', updatedState),
    exitCode: EXIT_ALLOW,
  }
}

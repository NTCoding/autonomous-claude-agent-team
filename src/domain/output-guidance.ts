import type { StateName, WorkflowState } from './workflow-state.js'
import type { OperationName } from './operation-gates.js'

export const SEPARATOR = '----------------------------------------------------------------'

export function formatBlock(title: string, body: string): string {
  return `${title}\n${SEPARATOR}\n${body}`
}

function transitionTitle(to: StateName, state: WorkflowState): string {
  if (to === 'RESPAWN' || to === 'DEVELOPING') {
    return `${to} (iteration: ${state.iteration})`
  }
  return to
}

export function formatTransitionSuccess(
  to: StateName,
  state: WorkflowState,
  procedureContent: string,
): string {
  return formatBlock(transitionTitle(to, state), procedureContent)
}

export function formatTransitionError(
  to: StateName,
  reason: string,
): string {
  return formatBlock(
    `Cannot transition to ${to}`,
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.`,
  )
}

export function formatIllegalTransitionError(
  reason: string,
): string {
  return formatBlock(
    'Illegal transition',
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.`,
  )
}

export function formatOperationGateError(op: OperationName, reason: string): string {
  return formatBlock(`Cannot ${op}`, reason)
}

const CMD = '/autonomous-claude-agent-team:workflow'

export function formatOperationSuccess(
  op: OperationName,
  state: WorkflowState,
): string {
  return formatBlock(op, operationSuccessBody(op, state))
}

type OperationBodyFn = (state: WorkflowState) => string

const OPERATION_BODIES: Record<OperationName, OperationBodyFn> = {
  'record-issue': (s) => `GitHub issue #${s.githubIssue ?? '?'} recorded.`,
  'record-branch': (s) => `Feature branch '${s.featureBranch ?? '?'}' recorded.`,
  'record-plan-approval': () => `Plan approved.\n\n  ${CMD} transition RESPAWN`,
  'assign-iteration-task': (s) => `Iteration task set: '${s.currentIterationTask ?? '?'}'`,
  'signal-done': () => (
    `Developer signaled completion.\n\n` +
    `Lead transitions:\n` +
    `  ${CMD} transition REVIEWING`
  ),
  'record-pr': (s) => `PR #${s.prNumber ?? '?'} recorded.`,
  'create-pr': (s) => (
    `Draft PR #${s.prNumber ?? '?'} created.\n\n` +
    `Transition to FEEDBACK:\n  ${CMD} transition FEEDBACK`
  ),
  'append-issue-checklist': (s) => `Iteration checklist appended to issue #${s.githubIssue ?? '?'}.`,
  'tick-iteration': (s) => `Iteration ticked complete on issue #${s.githubIssue ?? '?'}.`,
}

function operationSuccessBody(op: OperationName, state: WorkflowState): string {
  return OPERATION_BODIES[op](state)
}

export function formatInitSuccess(procedureContent: string): string {
  return formatBlock('Feature team initialized', procedureContent)
}

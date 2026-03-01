import type { StateName } from './workflow-state.js'

export type OperationName =
  | 'record-issue'
  | 'record-branch'
  | 'record-plan-approval'
  | 'assign-iteration-task'
  | 'signal-done'
  | 'record-pr'
  | 'create-pr'
  | 'append-issue-checklist'
  | 'tick-iteration'

export type OperationGateResult = { pass: true } | { pass: false; reason: string }

const OPERATION_GATES: Readonly<Record<OperationName, readonly StateName[]>> = {
  'record-issue': ['SPAWN'],
  'record-branch': ['PLANNING'],
  'record-plan-approval': ['PLANNING'],
  'assign-iteration-task': ['RESPAWN'],
  'signal-done': ['DEVELOPING'],
  'record-pr': ['PR_CREATION'],
  'create-pr': ['PR_CREATION'],
  'append-issue-checklist': ['PLANNING'],
  'tick-iteration': ['COMMITTING'],
}

export function checkOperationGate(op: OperationName, state: StateName): OperationGateResult {
  /* v8 ignore next */
  const allowed = OPERATION_GATES[op] ?? []
  if (allowed.includes(state)) {
    return { pass: true }
  }
  return {
    pass: false,
    reason: `${op} is only valid in [${allowed.join(', ')}]. Current state: ${state}.`,
  }
}

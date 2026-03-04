import type { WorkflowState } from '../../workflow-engine/index.js'
import { WorkflowStateError } from '../../workflow-engine/index.js'
import type { WorkflowOperation } from './workflow-types.js'

const CMD = '/autonomous-claude-agent-team:workflow'

function requireField<T>(value: T | undefined, fieldName: string): T {
  if (value === undefined) throw new WorkflowStateError(`Expected '${fieldName}' to be set`)
  return value
}

type OperationBodyFn = (state: WorkflowState) => string

const OPERATION_BODIES: Readonly<Record<string, OperationBodyFn | undefined>> = {
  'record-issue': (s) => `GitHub issue #${requireField(s.githubIssue, 'githubIssue')} recorded.`,
  'record-branch': (s) => `Feature branch '${requireField(s.featureBranch, 'featureBranch')}' recorded.`,
  'record-plan-approval': () => `Plan approved.\n\n  ${CMD} transition RESPAWN`,
  'assign-iteration-task': (s) => {
    const task = requireField(s.iterations[s.iterations.length - 1]?.task, 'current iteration task')
    return `Iteration task set: '${task}'`
  },
  'signal-done': () => (
    `Developer signaled completion.\n\n` +
    `Lead transitions:\n` +
    `  ${CMD} transition REVIEWING`
  ),
  'record-pr': (s) => `PR #${requireField(s.prNumber, 'prNumber')} recorded.`,
  'create-pr': (s) => (
    `Draft PR #${requireField(s.prNumber, 'prNumber')} created.\n\n` +
    `Transition to FEEDBACK:\n  ${CMD} transition FEEDBACK`
  ),
  'append-issue-checklist': (s) => `Iteration checklist appended to issue #${requireField(s.githubIssue, 'githubIssue')}.`,
  'tick-iteration': (s) => `Iteration ticked complete on issue #${requireField(s.githubIssue, 'githubIssue')}.`,
  'review-approved': () => `Review approved.\n\n  ${CMD} transition COMMITTING`,
  'review-rejected': () => `Review rejected.\n\n  ${CMD} transition DEVELOPING`,
  'coderabbit-feedback-addressed': () => `CodeRabbit feedback marked as addressed.\n\n  ${CMD} transition PR_CREATION`,
  'coderabbit-feedback-ignored': () => `CodeRabbit feedback marked as ignored.\n\n  ${CMD} transition PR_CREATION`,
} satisfies Record<WorkflowOperation, OperationBodyFn>

export function getOperationBody(op: string, state: WorkflowState): string {
  const bodyFn = OPERATION_BODIES[op]
  /* v8 ignore next */
  if (!bodyFn) return op
  return bodyFn(state)
}

export function getTransitionTitle(to: string, state: WorkflowState): string {
  if (to === 'RESPAWN' || to === 'DEVELOPING') {
    return `${to} (iteration: ${state.iteration})`
  }
  return to
}

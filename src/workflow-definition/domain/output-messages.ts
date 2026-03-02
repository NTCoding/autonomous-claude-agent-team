import type { WorkflowState } from '../../workflow-engine/index.js'
import type { WorkflowOperation } from './workflow-types.js'

const CMD = '/autonomous-claude-agent-team:workflow'

type OperationBodyFn = (state: WorkflowState) => string

const OPERATION_BODIES: Readonly<Record<string, OperationBodyFn | undefined>> = {
  'record-issue': (s) => `GitHub issue #${s.githubIssue ?? '?'} recorded.`,
  'record-branch': (s) => `Feature branch '${s.featureBranch ?? '?'}' recorded.`,
  'record-plan-approval': () => `Plan approved.\n\n  ${CMD} transition RESPAWN`,
  'assign-iteration-task': (s) => {
    const task = s.iterations[s.iterations.length - 1]?.task
    return `Iteration task set: '${task ?? '?'}'`
  },
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

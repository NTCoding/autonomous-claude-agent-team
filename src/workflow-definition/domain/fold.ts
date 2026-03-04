import type { WorkflowEvent } from './workflow-events.js'
import type { WorkflowState, IterationState } from '../../workflow-engine/index.js'

export const EMPTY_STATE: WorkflowState = {
  state: 'SPAWN',
  iteration: 0,
  iterations: [],
  userApprovedPlan: false,
  activeAgents: [],
}

function updateCurrentIteration(
  state: WorkflowState,
  update: Partial<IterationState>,
): WorkflowState {
  return {
    ...state,
    iterations: state.iterations.map((iter, i) =>
      i === state.iteration ? { ...iter, ...update } : iter
    ),
  }
}

function applyLintRan(
  state: WorkflowState,
  event: Extract<WorkflowEvent, { type: 'lint-ran' }>,
): WorkflowState {
  const existingFiles = state.iterations[state.iteration]?.lintedFiles ?? []
  const lintedFiles = event.lintedFiles
    ? [...new Set([...existingFiles, ...event.lintedFiles])]
    : existingFiles
  return updateCurrentIteration(state, { lintRanIteration: true, lintedFiles })
}

function applyTransitioned(
  state: WorkflowState,
  event: Extract<WorkflowEvent, { type: 'transitioned' }>,
): WorkflowState {
  const newPreBlockedState = event.to === 'BLOCKED' ? event.from : undefined
  const targetIteration = event.iteration === undefined ? state.iteration : event.iteration
  const base: WorkflowState = {
    ...state,
    state: event.to,
    preBlockedState: newPreBlockedState,
    iteration: targetIteration,
  }
  if (event.to !== 'DEVELOPING' || event.developingHeadCommit === undefined) {
    return base
  }
  const headCommit = event.developingHeadCommit
  return {
    ...base,
    iterations: base.iterations.map((iter, i) =>
      i === targetIteration
        ? { ...iter, developerDone: false, developingHeadCommit: headCommit, lintedFiles: [], lintRanIteration: false }
        : iter
    ),
  }
}

function applyAgentEvent(
  state: WorkflowState,
  event: WorkflowEvent,
): WorkflowState | null {
  switch (event.type) {
    case 'agent-registered':
      return {
        ...state,
        activeAgents: state.activeAgents.includes(event.agentType)
          ? state.activeAgents
          : [...state.activeAgents, event.agentType],
      }
    case 'agent-shut-down':
      return { ...state, activeAgents: state.activeAgents.filter((a) => a !== event.agentName) }
    default:
      return null
  }
}

function applyIterationEvent(
  state: WorkflowState,
  event: WorkflowEvent,
): WorkflowState | null {
  switch (event.type) {
    case 'developer-done-signaled':
      return updateCurrentIteration(state, { developerDone: true })
    case 'review-approved':
      return updateCurrentIteration(state, { reviewApproved: true })
    case 'review-rejected':
      return updateCurrentIteration(state, { reviewRejected: true })
    case 'coderabbit-addressed':
      return updateCurrentIteration(state, { coderabbitFeedbackAddressed: true })
    case 'coderabbit-ignored':
      return updateCurrentIteration(state, { coderabbitFeedbackIgnored: true })
    case 'lint-ran':
      return applyLintRan(state, event)
    default:
      return null
  }
}

export function applyEvent(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  const iterResult = applyIterationEvent(state, event)
  if (iterResult !== null) return iterResult

  const agentResult = applyAgentEvent(state, event)
  if (agentResult !== null) return agentResult

  switch (event.type) {
    case 'session-started':
      return { ...state, transcriptPath: event.transcriptPath }
    case 'issue-recorded':
      return { ...state, githubIssue: event.issueNumber }
    case 'branch-recorded':
      return { ...state, featureBranch: event.branch }
    case 'plan-approval-recorded':
      return { ...state, userApprovedPlan: true }
    case 'iteration-task-assigned': {
      const newIteration: IterationState = {
        task: event.task,
        developerDone: false,
        reviewApproved: false,
        reviewRejected: false,
        coderabbitFeedbackAddressed: false,
        coderabbitFeedbackIgnored: false,
        lintedFiles: [],
        lintRanIteration: false,
      }
      return { ...state, iterations: [...state.iterations, newIteration] }
    }
    case 'pr-recorded':
    case 'pr-created':
      return { ...state, prNumber: event.prNumber }
    case 'transitioned':
      return applyTransitioned(state, event)
    default:
      return state
  }
}

export function applyEvents(events: readonly WorkflowEvent[]): WorkflowState {
  return events.reduce(applyEvent, EMPTY_STATE)
}

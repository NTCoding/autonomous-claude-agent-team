import type { StateName, WorkflowState } from './workflow-state.js'

export function applyTransitionEffects(
  from: StateName,
  to: StateName,
  state: WorkflowState,
  newHeadCommit: string,
): WorkflowState {
  const withCommitBlock = applyCommitBlockEffect(to, state)
  const withStateChange = { ...withCommitBlock, state: to }

  if (to === 'BLOCKED') {
    return { ...withStateChange, preBlockedState: from }
  }

  if (from === 'BLOCKED') {
    const { preBlockedState: _removed, ...withoutPreBlocked } = withStateChange
    return withoutPreBlocked
  }

  if (to === 'DEVELOPING' && from === 'RESPAWN') {
    return applyRespawnToDevelopingEffects(withStateChange, newHeadCommit)
  }

  if (to === 'DEVELOPING' && from === 'REVIEWING') {
    return applyReviewingToDevelopingEffects(withStateChange, newHeadCommit)
  }

  if (to === 'RESPAWN') {
    const { currentIterationTask: _removed, ...withoutTask } = withStateChange
    return withoutTask
  }

  return withStateChange
}

function applyCommitBlockEffect(to: StateName, state: WorkflowState): WorkflowState {
  if (to === 'DEVELOPING' || to === 'REVIEWING') {
    return { ...state, commitsBlocked: true }
  }
  return { ...state, commitsBlocked: false }
}

function applyRespawnToDevelopingEffects(
  state: WorkflowState,
  newHeadCommit: string,
): WorkflowState {
  return {
    ...state,
    iteration: state.iteration + 1,
    developerDone: false,
    developingHeadCommit: newHeadCommit,
    lintedFiles: [],
  }
}

function applyReviewingToDevelopingEffects(
  state: WorkflowState,
  newHeadCommit: string,
): WorkflowState {
  return {
    ...state,
    developerDone: false,
    developingHeadCommit: newHeadCommit,
    lintedFiles: [],
  }
}

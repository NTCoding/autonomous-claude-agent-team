import type { StateName, WorkflowState } from './workflow-state.js'

export type PreconditionResult = { pass: true } | { pass: false; reason: string }

export type GitInfo = {
  readonly currentBranch: string
  readonly workingTreeClean: boolean
  readonly headCommit: string
  readonly changedFilesVsDefault: readonly string[]
  readonly hasCommitsVsDefault: boolean
}

export function checkPreconditions(
  from: StateName,
  to: StateName,
  state: WorkflowState,
  gitInfo: GitInfo,
  prChecksPass: boolean,
): PreconditionResult {
  if (to === 'BLOCKED' || from === 'BLOCKED') {
    return { pass: true }
  }

  if (to === 'DEVELOPING') {
    return checkDevelopingEntry(from, state, gitInfo)
  }

  return resolveTransitionCheck(from, to, state, gitInfo, prChecksPass)
}

function resolveTransitionCheck(
  from: StateName,
  to: StateName,
  state: WorkflowState,
  gitInfo: GitInfo,
  prChecksPass: boolean,
): PreconditionResult {
  const transitionKey = `${from}->${to}` as const
  const check = TRANSITION_CHECKS[transitionKey]
  if (check) return check(state, gitInfo, prChecksPass)
  return { pass: true }
}

type TransitionCheck = (
  state: WorkflowState,
  gitInfo: GitInfo,
  prChecksPass: boolean,
) => PreconditionResult

const TRANSITION_CHECKS: Partial<Record<string, TransitionCheck>> = {
  'DEVELOPING->REVIEWING': (state, gitInfo) => checkReviewingEntry(state, gitInfo),
  'SPAWN->PLANNING': (state) => checkPlanningEntry(state),
  'PLANNING->RESPAWN': (state, gitInfo) => checkRespawnFromPlanning(state, gitInfo),
  'COMMITTING->RESPAWN': (state, gitInfo) => checkCommittingExit(state, gitInfo),
  'COMMITTING->CR_REVIEW': (state, gitInfo) => checkCommittingExit(state, gitInfo),
  'FEEDBACK->COMPLETE': (state, _gitInfo, prChecksPass) => checkCompleteEntry(state, prChecksPass),
  'FEEDBACK->RESPAWN': () => ({ pass: true }),
}

function checkDevelopingEntry(
  from: StateName,
  state: WorkflowState,
  gitInfo: GitInfo,
): PreconditionResult {
  const branchCheck = checkFeatureBranch(state, gitInfo)
  if (!branchCheck.pass) return branchCheck

  if (!state.githubIssue) {
    return { pass: false, reason: 'githubIssue not set. Run record-issue <number> first.' }
  }

  if (from === 'RESPAWN') {
    return checkRespawnToDeveloping(state)
  }

  return { pass: true }
}

function checkFeatureBranch(state: WorkflowState, gitInfo: GitInfo): PreconditionResult {
  if (!state.featureBranch) {
    return { pass: true }
  }

  if (gitInfo.currentBranch === state.featureBranch) {
    return { pass: true }
  }

  return {
    pass: false,
    reason: `On branch '${gitInfo.currentBranch}', expected '${state.featureBranch}'. Run: git checkout ${state.featureBranch}`,
  }
}

function checkRespawnToDeveloping(state: WorkflowState): PreconditionResult {
  if (!state.currentIterationTask) {
    return {
      pass: false,
      reason: 'currentIterationTask not set. Run assign-iteration-task "<task>" first.',
    }
  }

  if (state.activeAgents.length > 0) {
    return {
      pass: false,
      reason: `Active agents still registered: [${state.activeAgents.join(', ')}]. Agents must run shut-down before RESPAWN can proceed.`,
    }
  }

  return { pass: true }
}

function checkReviewingEntry(state: WorkflowState, gitInfo: GitInfo): PreconditionResult {
  if (!state.developerDone) {
    return {
      pass: false,
      reason: 'developerDone is false. Developer must run signal-done first.',
    }
  }

  if (gitInfo.workingTreeClean) {
    return {
      pass: false,
      reason: 'No uncommitted changes found. Developer must leave changes unstaged for review.',
    }
  }

  if (!state.developingHeadCommit) {
    return { pass: true }
  }

  if (gitInfo.headCommit !== state.developingHeadCommit) {
    return {
      pass: false,
      reason: `New commits detected since DEVELOPING started. HEAD was '${state.developingHeadCommit}', now '${gitInfo.headCommit}'. Undo with: git reset HEAD~N`,
    }
  }

  return { pass: true }
}

function checkRespawnFromPlanning(state: WorkflowState, gitInfo: GitInfo): PreconditionResult {
  if (!state.userApprovedPlan) {
    return {
      pass: false,
      reason: 'userApprovedPlan is false. Present plan to user, get explicit approval, then run record-plan-approval.',
    }
  }

  if (!gitInfo.workingTreeClean) {
    return {
      pass: false,
      reason: 'Working tree is not clean. Commit, stash, or discard all changes before transitioning.',
    }
  }

  return { pass: true }
}

function checkCommittingExit(state: WorkflowState, gitInfo: GitInfo): PreconditionResult {
  if (!gitInfo.workingTreeClean) {
    return {
      pass: false,
      reason: 'Uncommitted changes detected. Commit all changes before transitioning.',
    }
  }

  const lintableFiles = gitInfo.changedFilesVsDefault.filter(isTypeScriptFile)

  if (lintableFiles.length > 0) {
    if (state.lintRanIteration !== state.iteration) {
      return {
        pass: false,
        reason: `lint_ran_iteration (${state.lintRanIteration}) does not match current iteration (${state.iteration}). Run: /autonomous-claude-agent-team:workflow run-lint <changed-files>`,
      }
    }

    const unlintedFiles = lintableFiles.filter((f) => !state.lintedFiles.includes(f))
    if (unlintedFiles.length > 0) {
      return {
        pass: false,
        reason: `Unlinted files: [${unlintedFiles.join(', ')}]. Run: /autonomous-claude-agent-team:workflow run-lint ${unlintedFiles.join(' ')}`,
      }
    }
  }

  if (!gitInfo.hasCommitsVsDefault) {
    return {
      pass: false,
      reason: 'No commits beyond default branch. Commit and push changes before transitioning.',
    }
  }

  return { pass: true }
}

function isTypeScriptFile(f: string): boolean {
  return f.endsWith('.ts') || f.endsWith('.tsx')
}

function checkPlanningEntry(state: WorkflowState): PreconditionResult {
  if (!state.githubIssue) {
    return { pass: false, reason: 'githubIssue not set. Run record-issue <number> first.' }
  }

  const hasDeveloper = state.activeAgents.some((name) => name.startsWith('developer-'))
  if (!hasDeveloper) {
    return {
      pass: false,
      reason: 'No developer agent spawned. Spawn a feature-team-developer before transitioning to PLANNING.',
    }
  }

  const hasReviewer = state.activeAgents.some((name) => name.startsWith('reviewer-'))
  if (!hasReviewer) {
    return {
      pass: false,
      reason: 'No reviewer agent spawned. Spawn a feature-team-reviewer before transitioning to PLANNING.',
    }
  }

  return { pass: true }
}

function checkCompleteEntry(state: WorkflowState, prChecksPass: boolean): PreconditionResult {
  if (!state.prNumber) {
    return {
      pass: false,
      reason: 'prNumber not set. Run record-pr <number> first.',
    }
  }

  if (!prChecksPass) {
    return {
      pass: false,
      reason: `PR checks failing for PR #${state.prNumber}. Run: gh pr checks ${state.prNumber}`,
    }
  }

  return { pass: true }
}

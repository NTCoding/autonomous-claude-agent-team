import { workflowSpec } from '@ntcoding/agentic-workflow-builder/testing'
import type { PreconditionResult } from '@ntcoding/agentic-workflow-builder/dsl'
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowEvent } from './workflow-events.js'
import type { WorkflowState, IterationState, StateName } from './workflow-types.js'
import { parseStateName } from './workflow-types.js'
import type { WorkflowDeps } from './workflow.js'
import { Workflow } from './workflow.js'
import { applyEvents } from './fold.js'
import { WORKFLOW_REGISTRY } from './registry.js'
import { WorkflowAdapter } from './workflow-adapter.js'
import type { GitInfo } from '@ntcoding/agentic-workflow-builder/dsl'

const AT = '2026-01-01T00:00:00Z'


export const cleanGit: GitInfo = {
  currentBranch: 'feature/test',
  workingTreeClean: true,
  headCommit: 'abc123',
  changedFilesVsDefault: [],
  hasCommitsVsDefault: false,
}

export const dirtyGit: GitInfo = {
  ...cleanGit,
  workingTreeClean: false,
}


export const DEFAULT_ITERATION: IterationState = {
  task: 'test task',
  developerDone: false,
  reviewApproved: false,
  reviewRejected: false,
  coderabbitFeedbackAddressed: false,
  coderabbitFeedbackIgnored: false,
  lintedFiles: [],
  lintRanIteration: false,
}


export function makeDeps(overrides?: Partial<WorkflowDeps>): WorkflowDeps {
  return {
    getGitInfo: () => cleanGit,
    checkPrChecks: () => true,
    createDraftPr: () => 99,
    appendIssueChecklist: () => undefined,
    tickFirstUncheckedIteration: () => undefined,
    runEslintOnFiles: () => true,
    fileExists: () => true,
    getPluginRoot: () => '/plugin',
    now: () => AT,
    ...overrides,
  }
}


export function issueRecorded(n: number): WorkflowEvent {
  return { type: 'issue-recorded', at: AT, issueNumber: n }
}

export function agentRegistered(agentType: string, agentId = 'agent-id'): WorkflowEvent {
  return { type: 'agent-registered', at: AT, agentType, agentId }
}

export function agentShutDown(agentName: string): WorkflowEvent {
  return { type: 'agent-shut-down', at: AT, agentName }
}

export function transitioned(
  from: StateName,
  to: StateName,
  extras?: {
    readonly iteration?: number
    readonly developingHeadCommit?: string
  },
): WorkflowEvent {
  return {
    type: 'transitioned',
    at: AT,
    from,
    to,
    ...(extras?.iteration === undefined ? {} : { iteration: extras.iteration }),
    ...(extras?.developingHeadCommit === undefined ? {} : { developingHeadCommit: extras.developingHeadCommit }),
  }
}

export function branchRecorded(b: string): WorkflowEvent {
  return { type: 'branch-recorded', at: AT, branch: b }
}

export function planApprovalRecorded(): WorkflowEvent {
  return { type: 'plan-approval-recorded', at: AT }
}

export function iterationTaskAssigned(task: string): WorkflowEvent {
  return { type: 'iteration-task-assigned', at: AT, task }
}

export function developerDoneSignaled(): WorkflowEvent {
  return { type: 'developer-done-signaled', at: AT }
}

export function reviewApproved(): WorkflowEvent {
  return { type: 'review-approved', at: AT }
}

export function reviewRejected(): WorkflowEvent {
  return { type: 'review-rejected', at: AT }
}

export function prRecorded(n: number): WorkflowEvent {
  return { type: 'pr-recorded', at: AT, prNumber: n }
}

export function lintRan(opts?: {
  readonly files?: number
  readonly passed?: boolean
  readonly lintedFiles?: string[]
}): WorkflowEvent {
  return {
    type: 'lint-ran',
    at: AT,
    files: opts?.files ?? 0,
    passed: opts?.passed ?? true,
    ...(opts?.lintedFiles === undefined ? {} : { lintedFiles: opts.lintedFiles }),
  }
}

export function coderabbitAddressed(): WorkflowEvent {
  return { type: 'coderabbit-addressed', at: AT }
}

export function coderabbitIgnored(): WorkflowEvent {
  return { type: 'coderabbit-ignored', at: AT }
}

export function eventsToPlanning(): readonly WorkflowEvent[] {
  return [
    issueRecorded(1),
    agentRegistered('developer-1'),
    agentRegistered('reviewer-1'),
    transitioned('SPAWN', 'PLANNING'),
  ]
}

export function eventsToRespawn(): readonly WorkflowEvent[] {
  return [
    ...eventsToPlanning(),
    planApprovalRecorded(),
    transitioned('PLANNING', 'RESPAWN'),
  ]
}

export function eventsToDeveloping(): readonly WorkflowEvent[] {
  return [
    ...eventsToRespawn(),
    agentShutDown('developer-1'),
    agentShutDown('reviewer-1'),
    iterationTaskAssigned('test task'),
    transitioned('RESPAWN', 'DEVELOPING', { iteration: 0, developingHeadCommit: 'abc123' }),
  ]
}

export function eventsToReviewing(): readonly WorkflowEvent[] {
  return [
    ...eventsToDeveloping(),
    developerDoneSignaled(),
    transitioned('DEVELOPING', 'REVIEWING'),
  ]
}

export function eventsToCommitting(): readonly WorkflowEvent[] {
  return [
    ...eventsToReviewing(),
    reviewApproved(),
    transitioned('REVIEWING', 'COMMITTING'),
  ]
}

export function eventsToCrReview(): readonly WorkflowEvent[] {
  return [
    ...eventsToCommitting(),
    lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
    transitioned('COMMITTING', 'CR_REVIEW'),
  ]
}

export function eventsToPrCreation(): readonly WorkflowEvent[] {
  return [
    ...eventsToCrReview(),
    coderabbitIgnored(),
    transitioned('CR_REVIEW', 'PR_CREATION'),
  ]
}

export function eventsToFeedback(): readonly WorkflowEvent[] {
  return [
    ...eventsToPrCreation(),
    prRecorded(42),
    transitioned('PR_CREATION', 'FEEDBACK'),
  ]
}

export function eventsToComplete(): readonly WorkflowEvent[] {
  return [
    ...eventsToFeedback(),
    transitioned('FEEDBACK', 'COMPLETE'),
  ]
}


const capturedDepsRef: { current: WorkflowDeps } = { current: makeDeps() }

export const spec = workflowSpec<WorkflowEvent, WorkflowState, WorkflowDeps, Workflow>({
  fold: applyEvents,
  rehydrate: (state, deps) => {
    capturedDepsRef.current = deps
    return Workflow.rehydrate(state, deps)
  },
  defaultDeps: makeDeps,
  getPendingEvents: (wf) => wf.getPendingEvents(),
  getState: (wf) => wf.getState(),
  mergeDeps: (defaults, overrides) => ({ ...defaults, ...overrides }),
})

export function transitionTo(wf: Workflow, target: StateName, depsOverride?: WorkflowDeps): PreconditionResult {
  const deps = depsOverride ?? capturedDepsRef.current
  const state = wf.getState()
  const from = state.currentStateMachineState
  const currentDef = WORKFLOW_REGISTRY[from]

  if (!currentDef.canTransitionTo.includes(target)) {
    return fail(
      `Illegal transition ${from} -> ${target}. Legal targets from ${from}: [${currentDef.canTransitionTo.join(', ') || 'none'}].`,
    )
  }

  if (target !== 'BLOCKED' && currentDef.transitionGuard) {
    const ctx = WorkflowAdapter.buildTransitionContext(state, from, target, deps)
    const guardResult = currentDef.transitionGuard(ctx)
    if (!guardResult.pass) return guardResult
  }

  const targetDef = WORKFLOW_REGISTRY[target]
  const stateBefore = wf.getState()
  const ctx = WorkflowAdapter.buildTransitionContext(stateBefore, from, target, deps)
  const stateAfter = targetDef.onEntry
    ? targetDef.onEntry(stateBefore, ctx)
    : stateBefore

  const event = WorkflowAdapter.buildTransitionEvent
    ? WorkflowAdapter.buildTransitionEvent(from, target, stateBefore, stateAfter, AT)
    : { type: 'transitioned', at: AT }
  wf.appendEvent(event)
  targetDef.afterEntry?.()
  return pass()
}

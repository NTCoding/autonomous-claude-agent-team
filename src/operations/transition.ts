import type { StateName, WorkflowState } from '../domain/workflow-state.js'
import { isTransitionLegal } from '../domain/transition-map.js'
import { checkPreconditions } from '../domain/preconditions.js'
import type { GitInfo } from '../domain/preconditions.js'
import { applyTransitionEffects } from '../domain/transition-effects.js'
import { createEventEntry } from '../domain/event-log.js'
import { getProcedurePath } from '../domain/state-procedure-map.js'
import {
  formatTransitionSuccess,
  formatTransitionError,
  formatIllegalTransitionError,
} from '../domain/output-guidance.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type TransitionDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly getStateFilePath: (sessionId: string) => string
  readonly getGitInfo: () => GitInfo
  readonly checkPrChecks: (prNumber: number) => boolean
  readonly readFile: (path: string) => string
  readonly getPluginRoot: () => string
  readonly now: () => string
}

export function runTransition(
  sessionId: string,
  to: StateName,
  deps: TransitionDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  const state = deps.readState(statePath)
  const legalityResult = isTransitionLegal(state.state, to, state.preBlockedState)

  if (!legalityResult.legal) {
    const currentProcedure = readCurrentProcedure(state.state, deps)
    return { output: formatIllegalTransitionError(legalityResult.reason, currentProcedure), exitCode: EXIT_BLOCK }
  }

  const gitInfo = deps.getGitInfo()
  const prChecksPass = determinePrChecksPass(to, state, deps)
  const preconditionResult = checkPreconditions(state.state, to, state, gitInfo, prChecksPass)

  if (!preconditionResult.pass) {
    const currentProcedure = readCurrentProcedure(state.state, deps)
    return { output: formatTransitionError(to, preconditionResult.reason, currentProcedure), exitCode: EXIT_BLOCK }
  }

  const updatedState = applyTransitionWithLog(state.state, to, state, gitInfo.headCommit, deps.now())
  deps.writeState(statePath, updatedState)
  const procedurePath = getProcedurePath(to, deps.getPluginRoot())
  const procedureContent = deps.readFile(procedurePath)
  return { output: formatTransitionSuccess(to, updatedState, procedureContent), exitCode: EXIT_ALLOW }
}

function determinePrChecksPass(
  to: StateName,
  state: WorkflowState,
  deps: TransitionDeps,
): boolean {
  if (to !== 'COMPLETE') {
    return false
  }
  if (!state.prNumber) {
    return false
  }
  return deps.checkPrChecks(state.prNumber)
}

function readCurrentProcedure(state: StateName, deps: TransitionDeps): string {
  const path = getProcedurePath(state, deps.getPluginRoot())
  return deps.readFile(path)
}

function applyTransitionWithLog(
  from: StateName,
  to: StateName,
  state: WorkflowState,
  headCommit: string,
  now: string,
): WorkflowState {
  const transitioned = applyTransitionEffects(from, to, state, headCommit)
  return {
    ...transitioned,
    eventLog: [
      ...transitioned.eventLog,
      createEventEntry('transition', now, { from, to }),
    ],
  }
}

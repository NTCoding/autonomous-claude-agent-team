import type { PreconditionResult } from './result'

export type GitInfo = {
  readonly currentBranch: string
  readonly workingTreeClean: boolean
  readonly headCommit: string
  readonly changedFilesVsDefault: readonly string[]
  readonly hasCommitsVsDefault: boolean
}

export type TransitionContext<TState, TStateName extends string = string> = {
  readonly state: TState
  readonly gitInfo: GitInfo
  readonly prChecksPass: boolean
  readonly from: TStateName
  readonly to: TStateName
}

export type BashForbiddenConfig = {
  readonly commands: readonly string[]
  readonly flags?: readonly string[]
}

export type WorkflowStateDefinition<
  TState,
  TStateName extends string = string,
  TOperation extends string = string,
> = {
  readonly emoji: string
  readonly agentInstructions: string
  readonly canTransitionTo: readonly TStateName[]
  readonly allowedWorkflowOperations: readonly TOperation[]
  readonly forbidden?: {
    readonly write?: boolean
  }
  readonly allowForbidden?: {
    readonly bash?: readonly string[]
  }
  readonly transitionGuard?: (ctx: TransitionContext<TState, TStateName>) => PreconditionResult
  readonly onEntry?: (state: TState, ctx: TransitionContext<TState, TStateName>) => TState
  readonly afterEntry?: () => void
}

export type WorkflowRegistry<
  TState,
  TStateName extends string = string,
  TOperation extends string = string,
> = {
  readonly [K in TStateName]: WorkflowStateDefinition<TState, TStateName, TOperation>
}

export type SpecConfig<TEvent, TState, TDeps, TWorkflow> = {
  readonly fold: (events: readonly TEvent[]) => TState
  readonly rehydrate: (state: TState, deps: TDeps) => TWorkflow
  readonly defaultDeps: () => TDeps
  readonly getPendingEvents: (wf: TWorkflow) => readonly TEvent[]
  readonly getState: (wf: TWorkflow) => TState
  readonly mergeDeps: (defaults: TDeps, overrides: Partial<TDeps>) => TDeps
}

export type OperationResult<TEvent, TState, TResult> = {
  readonly result: TResult
  readonly events: readonly TEvent[]
  readonly state: TState
}

export type ThrowResult = { readonly error: unknown }

export type GivenPhase<TEvent, TState, TDeps, TWorkflow> = {
  readonly withDeps: (overrides: Partial<TDeps>) => GivenPhase<TEvent, TState, TDeps, TWorkflow>
  readonly when: <TResult>(op: (wf: TWorkflow) => TResult) => OperationResult<TEvent, TState, TResult>
  readonly whenThrows: (op: (wf: TWorkflow) => unknown) => ThrowResult
}

export type WorkflowSpecification<TEvent, TState, TDeps, TWorkflow> = {
  readonly given: (...events: readonly TEvent[]) => GivenPhase<TEvent, TState, TDeps, TWorkflow>
}

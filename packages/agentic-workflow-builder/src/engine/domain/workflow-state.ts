export class WorkflowStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowStateError'
  }
}

export type BaseWorkflowState<TStateName extends string = string> = { currentStateMachineState: TStateName }

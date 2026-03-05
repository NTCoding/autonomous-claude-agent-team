export class WorkflowStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowStateError'
  }
}

export type BaseWorkflowState = { currentStateMachineState: string }

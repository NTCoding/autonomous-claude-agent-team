import { WorkflowStateError } from './workflow-state.js'

describe('WorkflowStateError', () => {
  it('has name WorkflowStateError', () => {
    const error = new WorkflowStateError('test')
    expect(error.name).toStrictEqual('WorkflowStateError')
  })

  it('preserves the message', () => {
    const error = new WorkflowStateError('something broke')
    expect(error.message).toStrictEqual('something broke')
  })

  it('is an instance of Error', () => {
    const error = new WorkflowStateError('test')
    expect(error).toBeInstanceOf(Error)
  })
})

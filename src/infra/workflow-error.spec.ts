import { WorkflowError } from './workflow-error.js'

describe('WorkflowError', () => {
  it('sets message', () => {
    const error = new WorkflowError('something went wrong')
    expect(error.message).toStrictEqual('something went wrong')
  })

  it('sets name to WorkflowError', () => {
    const error = new WorkflowError('any message')
    expect(error.name).toStrictEqual('WorkflowError')
  })

  it('is an instance of Error', () => {
    const error = new WorkflowError('any message')
    expect(error instanceof Error).toStrictEqual(true)
  })
})

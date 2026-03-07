import { describe, it, expect } from 'vitest'
import { createWorkflowCli } from './workflow-cli.js'

describe('workflow-cli', () => {
  it('exports createWorkflowCli function', () => {
    expect(typeof createWorkflowCli).toBe('function')
  })
})

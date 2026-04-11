import { describe, it, expect } from 'vitest'
import { createOpenCodeWorkflowPlugin, OpenCodeTranscriptReader } from './index.js'

describe('opencode barrel exports', () => {
  it('exports all public API', () => {
    expect(createOpenCodeWorkflowPlugin).toBeDefined()
    expect(OpenCodeTranscriptReader).toBeDefined()
  })
})

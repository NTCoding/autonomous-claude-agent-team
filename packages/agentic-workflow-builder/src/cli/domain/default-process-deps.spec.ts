import { describe, it, expect } from 'vitest'
import { createDefaultProcessDeps } from './default-process-deps.js'

describe('createDefaultProcessDeps', () => {
  it('exports a function', () => {
    expect(createDefaultProcessDeps).toBeTypeOf('function')
  })
})

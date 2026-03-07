import { describe, it, expect } from 'vitest'
import { arg, extractField, defineCommands, defineHooks, createWorkflowRunner, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK, HookCommonInputSchema, PreToolUseInputSchema } from './index.js'

describe('cli barrel exports', () => {
  it('exports all public API', () => {
    expect(arg).toBeDefined()
    expect(extractField).toBeDefined()
    expect(defineCommands).toBeDefined()
    expect(defineHooks).toBeDefined()
    expect(createWorkflowRunner).toBeDefined()
    expect(EXIT_ALLOW).toBe(0)
    expect(EXIT_ERROR).toBe(1)
    expect(EXIT_BLOCK).toBe(2)
    expect(HookCommonInputSchema).toBeDefined()
    expect(PreToolUseInputSchema).toBeDefined()
  })
})

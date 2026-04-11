import { describe, it, expect } from 'vitest'
import { arg, extractField, defineRoutes, createWorkflowRunner, createWorkflowCli, createClaudeCodeWorkflowCli, EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK, HookCommonInputSchema, PreToolUseInputSchema, SubagentStartInputSchema, TeammateIdleInputSchema, formatDenyDecision, formatContextInjection } from './index.js'

describe('cli barrel exports', () => {
  it('exports all public API', () => {
    expect(arg).toBeDefined()
    expect(extractField).toBeDefined()
    expect(defineRoutes).toBeDefined()
    expect(createWorkflowRunner).toBeDefined()
    expect(createWorkflowCli).toBeDefined()
    expect(createClaudeCodeWorkflowCli).toBeDefined()
    expect(EXIT_ALLOW).toBe(0)
    expect(EXIT_ERROR).toBe(1)
    expect(EXIT_BLOCK).toBe(2)
    expect(HookCommonInputSchema).toBeDefined()
    expect(PreToolUseInputSchema).toBeDefined()
    expect(SubagentStartInputSchema).toBeDefined()
    expect(TeammateIdleInputSchema).toBeDefined()
    expect(formatDenyDecision).toBeDefined()
    expect(formatContextInjection).toBeDefined()
  })
})

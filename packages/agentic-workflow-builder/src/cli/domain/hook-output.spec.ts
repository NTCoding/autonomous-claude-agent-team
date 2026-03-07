import { describe, it, expect } from 'vitest'
import { formatDenyDecision, formatContextInjection } from './hook-output.js'

describe('formatDenyDecision', () => {
  it('wraps reason in PreToolUse deny JSON structure', () => {
    const result = JSON.parse(formatDenyDecision('Not allowed'))
    expect(result).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Not allowed',
      },
    })
  })
})

describe('formatContextInjection', () => {
  it('wraps context in additionalContext JSON structure', () => {
    const result = JSON.parse(formatContextInjection('some context'))
    expect(result).toStrictEqual({ additionalContext: 'some context' })
  })
})

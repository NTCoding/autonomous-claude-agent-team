import {
  formatDenyDecision,
  formatContextInjection,
  EXIT_ALLOW,
  EXIT_BLOCK,
  EXIT_ERROR,
} from './hook-io.js'

describe('formatDenyDecision', () => {
  it('includes permissionDecision deny and reason', () => {
    const output = formatDenyDecision('reason here')
    expect(output).toContain('"permissionDecision":"deny"')
    expect(output).toContain('reason here')
  })

  it('includes hookEventName PreToolUse', () => {
    const output = formatDenyDecision('any reason')
    expect(output).toContain('PreToolUse')
  })
})

describe('formatContextInjection', () => {
  it('wraps context in additionalContext field', () => {
    const output = formatContextInjection('ctx text')
    expect(output).toContain('"additionalContext"')
    expect(output).toContain('ctx text')
  })
})

describe('exit code constants', () => {
  it('EXIT_ALLOW is 0, EXIT_BLOCK is 2, EXIT_ERROR is 1', () => {
    expect(EXIT_ALLOW).toStrictEqual(0)
    expect(EXIT_BLOCK).toStrictEqual(2)
    expect(EXIT_ERROR).toStrictEqual(1)
  })
})

import { describe, it, expect } from 'vitest'
import { HookCommonInputSchema, PreToolUseInputSchema } from './hook-schemas.js'

const validCommon = {
  session_id: 'abc-123',
  transcript_path: '/tmp/transcript.json',
  cwd: '/home/user/project',
  hook_event_name: 'PreToolUse',
}

describe('HookCommonInputSchema', () => {
  it('parses valid common input', () => {
    const result = HookCommonInputSchema.parse(validCommon)
    expect(result.session_id).toBe('abc-123')
    expect(result.hook_event_name).toBe('PreToolUse')
  })

  it('accepts optional permission_mode', () => {
    const result = HookCommonInputSchema.parse({ ...validCommon, permission_mode: 'auto' })
    expect(result.permission_mode).toBe('auto')
  })

  it('rejects missing session_id', () => {
    const { session_id: _, ...noSession } = validCommon
    expect(() => HookCommonInputSchema.parse(noSession)).toThrow()
  })
})

describe('PreToolUseInputSchema', () => {
  it('parses valid pre-tool-use input', () => {
    const input = {
      ...validCommon,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    }
    const result = PreToolUseInputSchema.parse(input)
    expect(result.tool_name).toBe('Bash')
    expect(result.tool_input).toEqual({ command: 'ls' })
    expect(result.tool_use_id).toBe('tool-1')
  })

  it('rejects missing tool_name', () => {
    const input = {
      ...validCommon,
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    }
    expect(() => PreToolUseInputSchema.parse(input)).toThrow()
  })

  it('rejects missing tool_input', () => {
    const input = {
      ...validCommon,
      tool_name: 'Bash',
      tool_use_id: 'tool-1',
    }
    expect(() => PreToolUseInputSchema.parse(input)).toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { HookCommonInputSchema, PreToolUseInputSchema, SubagentStartInputSchema, TeammateIdleInputSchema } from './hook-schemas.js'

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

describe('SubagentStartInputSchema', () => {
  it('parses valid subagent start input', () => {
    const input = {
      ...validCommon,
      hook_event_name: 'SubagentStart',
      agent_id: 'agt-1',
      agent_type: 'developer-1',
    }
    const result = SubagentStartInputSchema.parse(input)
    expect(result.agent_id).toBe('agt-1')
    expect(result.agent_type).toBe('developer-1')
  })

  it('rejects missing agent_id', () => {
    const input = {
      ...validCommon,
      hook_event_name: 'SubagentStart',
      agent_type: 'developer-1',
    }
    expect(() => SubagentStartInputSchema.parse(input)).toThrow()
  })

  it('rejects missing agent_type', () => {
    const input = {
      ...validCommon,
      hook_event_name: 'SubagentStart',
      agent_id: 'agt-1',
    }
    expect(() => SubagentStartInputSchema.parse(input)).toThrow()
  })
})

describe('TeammateIdleInputSchema', () => {
  it('parses valid teammate idle input', () => {
    const input = {
      ...validCommon,
      hook_event_name: 'TeammateIdle',
      teammate_name: 'developer-1',
    }
    const result = TeammateIdleInputSchema.parse(input)
    expect(result.teammate_name).toBe('developer-1')
  })

  it('accepts missing teammate_name as optional', () => {
    const input = {
      ...validCommon,
      hook_event_name: 'TeammateIdle',
    }
    const result = TeammateIdleInputSchema.parse(input)
    expect(result.teammate_name).toBeUndefined()
  })
})

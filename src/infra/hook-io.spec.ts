import {
  parseCommonInput,
  parsePreToolUseInput,
  parseSubagentStartInput,
  parseTeammateIdleInput,
  formatDenyDecision,
  formatContextInjection,
  EXIT_ALLOW,
  EXIT_BLOCK,
  EXIT_ERROR,
} from './hook-io.js'

const validCommon = {
  session_id: 'sess-1',
  transcript_path: '/test/t.jsonl',
  cwd: '/project',
  permission_mode: 'default',
  hook_event_name: 'PreToolUse',
}

describe('parseCommonInput', () => {
  it('parses valid common input', () => {
    const result = parseCommonInput(JSON.stringify(validCommon))
    expect(result.session_id).toStrictEqual('sess-1')
    expect(result.transcript_path).toStrictEqual('/test/t.jsonl')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseCommonInput('not json')).toThrow('Cannot parse hook input JSON')
  })

  it('throws when required fields are missing', () => {
    expect(() => parseCommonInput(JSON.stringify({ session_id: 'x' }))).toThrow(
      'Invalid hook input',
    )
  })
})

describe('parsePreToolUseInput', () => {
  it('parses valid PreToolUse input', () => {
    const input = { ...validCommon, tool_name: 'Bash', tool_input: {}, tool_use_id: 'tu-1' }
    const result = parsePreToolUseInput(JSON.stringify(input))
    expect(result.tool_name).toStrictEqual('Bash')
    expect(result.tool_use_id).toStrictEqual('tu-1')
  })

  it('throws when tool_name is missing', () => {
    expect(() => parsePreToolUseInput(JSON.stringify(validCommon))).toThrow('Invalid hook input')
  })
})

describe('parseSubagentStartInput', () => {
  it('parses with required agent_id and agent_type', () => {
    const input = { ...validCommon, agent_id: 'a889ead9bc6dbee18', agent_type: 'developer-1' }
    const result = parseSubagentStartInput(JSON.stringify(input))
    expect(result.agent_id).toStrictEqual('a889ead9bc6dbee18')
    expect(result.agent_type).toStrictEqual('developer-1')
  })

  it('throws when agent_id is missing', () => {
    const input = { ...validCommon, agent_type: 'developer-1' }
    expect(() => parseSubagentStartInput(JSON.stringify(input))).toThrow('Invalid hook input')
  })

  it('throws when agent_type is missing', () => {
    const input = { ...validCommon, agent_id: 'a889ead9bc6dbee18' }
    expect(() => parseSubagentStartInput(JSON.stringify(input))).toThrow('Invalid hook input')
  })
})

describe('parseTeammateIdleInput', () => {
  it('parses without optional teammate_name', () => {
    const result = parseTeammateIdleInput(JSON.stringify(validCommon))
    expect(result.teammate_name).toStrictEqual(undefined)
  })

  it('parses with teammate_name', () => {
    const input = { ...validCommon, teammate_name: 'developer-1' }
    const result = parseTeammateIdleInput(JSON.stringify(input))
    expect(result.teammate_name).toStrictEqual('developer-1')
  })
})

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

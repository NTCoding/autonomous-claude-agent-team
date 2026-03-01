import { runVerifyIdentity } from './verify-identity.js'
import type { VerifyIdentityDeps } from './verify-identity.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import type { AssistantMessage } from '../domain/identity-rules.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }

function makeHookInput(): PreToolUseInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
    tool_use_id: 'tool-1',
  }
}

function makeMsg(id: string, hasText: boolean, startsWithLead: boolean): AssistantMessage {
  return { id, hasTextContent: hasText, startsWithLeadPrefix: startsWithLead }
}

function makeDeps(
  messages: readonly AssistantMessage[],
  stateToReturn = PLANNING_STATE,
  exists = true,
): VerifyIdentityDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    readTranscriptMessages: () => messages,
  }
}

describe('runVerifyIdentity — no state file', () => {
  it('allows when no state file exists', () => {
    const deps = makeDeps([], PLANNING_STATE, false)
    const result = runVerifyIdentity('s1', makeHookInput(), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })
})

describe('runVerifyIdentity — identity verified', () => {
  it('allows when last message starts with LEAD prefix', () => {
    const messages = [
      makeMsg('1', true, true),
      makeMsg('2', true, true),
    ]
    const deps = makeDeps(messages)
    const result = runVerifyIdentity('s1', makeHookInput(), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })

  it('allows when lead has never spoken (first message)', () => {
    const deps = makeDeps([])
    const result = runVerifyIdentity('s1', makeHookInput(), deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runVerifyIdentity — identity lost', () => {
  it('injects recovery context when last message lacks LEAD prefix', () => {
    const messages = [
      makeMsg('1', true, true),
      makeMsg('2', true, false),
    ]
    const deps = makeDeps(messages)
    const result = runVerifyIdentity('s1', makeHookInput(), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('additionalContext')
  })
})

import { runBlockCommits } from './block-commits.js'
import type { BlockCommitsDeps } from './block-commits.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const COMMITS_BLOCKED_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  commitsBlocked: true,
}
const COMMITTING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'COMMITTING',
  commitsBlocked: false,
}

function makeHookInput(command: string): PreToolUseInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: 'tool-1',
  }
}

function makeDeps(stateToReturn: WorkflowState, exists = true): BlockCommitsDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
  }
}

describe('runBlockCommits — no state file', () => {
  it('allows when no state file exists', () => {
    const deps = makeDeps(COMMITS_BLOCKED_STATE, false)
    const result = runBlockCommits('s1', makeHookInput('git commit -m "x"'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })

  it('allows when tool_input has no command field', () => {
    const hookInput: PreToolUseInput = {
      session_id: 'sess1',
      transcript_path: '/test/transcript.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {},
      tool_use_id: 'tool-1',
    }
    const deps = makeDeps(COMMITS_BLOCKED_STATE)
    const result = runBlockCommits('s1', hookInput, deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runBlockCommits — commit blocking', () => {
  it('blocks git commit when commitsBlocked is true', () => {
    const deps = makeDeps(COMMITS_BLOCKED_STATE)
    const result = runBlockCommits('s1', makeHookInput('git commit -m "x"'), deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('deny')
  })

  it('allows git commit when commitsBlocked is false', () => {
    const deps = makeDeps(COMMITTING_STATE)
    const result = runBlockCommits('s1', makeHookInput('git commit -m "x"'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })

  it('allows non-commit commands even when blocked', () => {
    const deps = makeDeps(COMMITS_BLOCKED_STATE)
    const result = runBlockCommits('s1', makeHookInput('npm test'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

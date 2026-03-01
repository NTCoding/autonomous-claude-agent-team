import { runEvaluateIdle } from './evaluate-idle.js'
import type { EvaluateIdleDeps } from './evaluate-idle.js'
import type { TeammateIdleInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const DEVELOPING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
}

const BLOCKED_STATE: WorkflowState = { ...INITIAL_STATE, state: 'BLOCKED' }

function makeHookInput(teammateName?: string): TeammateIdleInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'TeammateIdle',
    teammate_name: teammateName,
  }
}

function makeDeps(stateToReturn: WorkflowState, exists = true): EvaluateIdleDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
  }
}

describe('runEvaluateIdle — no state file', () => {
  it('allows when no state file exists', () => {
    const deps = makeDeps(DEVELOPING_STATE, false)
    const result = runEvaluateIdle('s1', makeHookInput('lead-1'), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })
})

describe('runEvaluateIdle — idle allowed', () => {
  it('allows idle when lead is in BLOCKED state', () => {
    const deps = makeDeps(BLOCKED_STATE)
    const result = runEvaluateIdle('s1', makeHookInput('lead-1'), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })

  it('allows idle when teammate_name is absent', () => {
    const deps = makeDeps(DEVELOPING_STATE)
    const result = runEvaluateIdle('s1', makeHookInput(undefined), deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runEvaluateIdle — idle blocked', () => {
  it('blocks lead idle in non-terminal state', () => {
    const deps = makeDeps(DEVELOPING_STATE)
    const result = runEvaluateIdle('s1', makeHookInput('lead-1'), deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Lead cannot go idle')
  })

  it('blocks developer idle when developerDone is false', () => {
    const state: WorkflowState = { ...DEVELOPING_STATE, developerDone: false }
    const deps = makeDeps(state)
    const result = runEvaluateIdle('s1', makeHookInput('developer-1'), deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Developer cannot go idle')
  })
})

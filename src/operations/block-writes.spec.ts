import { runBlockWrites } from './block-writes.js'
import type { BlockWritesDeps } from './block-writes.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const RESPAWN_STATE: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN' }
const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }

function makeHookInput(toolName: string, extraInput?: Record<string, unknown>): PreToolUseInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { ...extraInput },
    tool_use_id: 'tool-1',
  }
}

function makeDeps(
  stateToReturn: WorkflowState,
  exists = true,
): BlockWritesDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
  }
}

describe('runBlockWrites — no state file', () => {
  it('allows when no state file exists', () => {
    const deps = makeDeps(RESPAWN_STATE, false)
    const result = runBlockWrites('s1', makeHookInput('Write', { file_path: '/src/a.ts' }), deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runBlockWrites — RESPAWN write blocking', () => {
  it('blocks Write tool in RESPAWN state', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const hookInput = makeHookInput('Write', { file_path: '/src/file.ts' })
    const result = runBlockWrites('s1', hookInput, deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('deny')
  })

  it('blocks git commit bash command in RESPAWN state', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const hookInput = makeHookInput('Bash', { command: 'git commit -m "wip"' })
    const result = runBlockWrites('s1', hookInput, deps)
    expect(result.exitCode).toStrictEqual(2)
  })
})

describe('runBlockWrites — non-RESPAWN state', () => {
  it('allows Write tool outside RESPAWN', () => {
    const deps = makeDeps(PLANNING_STATE)
    const hookInput = makeHookInput('Write', { file_path: '/src/file.ts' })
    const result = runBlockWrites('s1', hookInput, deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

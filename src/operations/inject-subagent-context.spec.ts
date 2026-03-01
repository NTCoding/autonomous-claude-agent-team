import { runInjectSubagentContext } from './inject-subagent-context.js'
import type { InjectSubagentContextDeps } from './inject-subagent-context.js'
import type { SubagentStartInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const RESPAWN_STATE: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN', githubIssue: 42 }

function makeHookInput(agentType: string, agentId = 'agent-abc123'): SubagentStartInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'SubagentStart',
    agent_id: agentId,
    agent_type: agentType,
  }
}

function makeDeps(
  stateToReturn: WorkflowState,
  exists = true,
  captureState?: (state: WorkflowState) => void,
): InjectSubagentContextDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    writeState: (_path, state) => captureState?.(state),
    now: () => '2026-01-01T00:00:00Z',
  }
}

describe('runInjectSubagentContext — no state file', () => {
  it('returns empty output when no state file exists', () => {
    const deps = makeDeps(RESPAWN_STATE, false)
    const result = runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })
})

describe('runInjectSubagentContext — context injection', () => {
  it('injects workflow state and active agents', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const result = runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('RESPAWN')
    expect(result.output).toContain('additionalContext')
  })

  it('includes CLI commands in context', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const result = runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(result.output).toContain('signal-done')
    expect(result.output).toContain('run-lint')
  })
})

describe('runInjectSubagentContext — agent registration', () => {
  it('registers agent_type as active agent name', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps(RESPAWN_STATE, true, (s) => captured.push(s))
    runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(captured[0]?.activeAgents).toContain('developer-1')
  })

  it('does not add duplicate when agent is already registered', () => {
    const stateWithAgent: WorkflowState = { ...RESPAWN_STATE, activeAgents: ['developer-1'] }
    const captured: WorkflowState[] = []
    const deps = makeDeps(stateWithAgent, true, (s) => captured.push(s))
    runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(captured[0]?.activeAgents).toStrictEqual(['developer-1'])
  })

  it('appends subagent-start event with agent_type and agent_id', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps(RESPAWN_STATE, true, (s) => captured.push(s))
    runInjectSubagentContext('s1', makeHookInput('developer-1', 'a889ead9bc6dbee18'), deps)
    const lastEvent = captured[0]?.eventLog.at(-1)
    expect(lastEvent?.op).toStrictEqual('subagent-start')
    expect(lastEvent?.detail).toStrictEqual({ agent: 'developer-1', agentId: 'a889ead9bc6dbee18' })
  })
})

describe('runInjectSubagentContext — always allows', () => {
  it('allows any agent type without blocking', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const result = runInjectSubagentContext('s1', makeHookInput('alice'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })

  it('allows agents in any workflow state', () => {
    const spawnState: WorkflowState = { ...INITIAL_STATE, state: 'SPAWN' }
    const deps = makeDeps(spawnState)
    const result = runInjectSubagentContext('s1', makeHookInput('developer-1'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })

  it('allows duplicate role agents', () => {
    const stateWithDeveloper: WorkflowState = {
      ...RESPAWN_STATE,
      activeAgents: ['developer-1'],
    }
    const deps = makeDeps(stateWithDeveloper)
    const result = runInjectSubagentContext('s1', makeHookInput('developer-2'), deps)
    expect(result.exitCode).toStrictEqual(0)
  })
})

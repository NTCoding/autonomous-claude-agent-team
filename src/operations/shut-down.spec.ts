import { runShutDown } from './shut-down.js'
import type { ShutDownDeps } from './shut-down.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const DEVELOPING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  activeAgents: ['developer-1', 'reviewer-1'],
}

function makeDeps(
  stateToReturn: WorkflowState,
  exists = true,
  captureState?: (state: WorkflowState) => void,
): ShutDownDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    writeState: (_path, state) => captureState?.(state),
    now: () => '2026-01-01T00:00:00Z',
  }
}

describe('runShutDown — no state file', () => {
  it('returns error when no state file exists', () => {
    const deps = makeDeps(DEVELOPING_STATE, false)
    const result = runShutDown('s1', 'developer-1', deps)
    expect(result.exitCode).toStrictEqual(1)
    expect(result.output).toContain('no state file')
  })
})

describe('runShutDown — removes agent from activeAgents', () => {
  it('removes agent from activeAgents', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps(DEVELOPING_STATE, true, (s) => captured.push(s))
    runShutDown('s1', 'developer-1', deps)
    expect(captured[0]?.activeAgents).toStrictEqual(['reviewer-1'])
  })

  it('returns confirmation with remaining agents', () => {
    const deps = makeDeps(DEVELOPING_STATE)
    const result = runShutDown('s1', 'developer-1', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain("agent 'developer-1' deregistered")
    expect(result.output).toContain('reviewer-1')
  })
})

describe('runShutDown — logs shut-down event', () => {
  it('appends shut-down event with agent name', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps(DEVELOPING_STATE, true, (s) => captured.push(s))
    runShutDown('s1', 'developer-1', deps)
    const lastEvent = captured[0]?.eventLog.at(-1)
    expect(lastEvent?.op).toStrictEqual('shut-down')
    expect(lastEvent?.detail).toStrictEqual({ agent: 'developer-1' })
  })
})

describe('runShutDown — agent not in activeAgents', () => {
  it('keeps activeAgents unchanged but still logs event', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps(DEVELOPING_STATE, true, (s) => captured.push(s))
    runShutDown('s1', 'unknown-agent', deps)
    expect(captured[0]?.activeAgents).toStrictEqual(['developer-1', 'reviewer-1'])
    const lastEvent = captured[0]?.eventLog.at(-1)
    expect(lastEvent?.op).toStrictEqual('shut-down')
    expect(lastEvent?.detail).toStrictEqual({ agent: 'unknown-agent' })
  })
})

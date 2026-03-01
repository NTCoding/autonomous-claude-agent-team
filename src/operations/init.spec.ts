import { runInit } from './init.js'
import type { InitDeps } from './init.js'
import type { WorkflowState } from '../domain/workflow-state.js'

function makeDeps(overrides?: Partial<InitDeps>): InitDeps {
  return {
    stateFileExists: () => false,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    readFile: () => '# SPAWN\n\n## TODO\n\n- [ ] Create issue',
    getPluginRoot: () => '/test/plugin',
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function captureWrittenState(written: WorkflowState[]): Pick<InitDeps, 'writeState'> {
  return { writeState: (_, s) => { written.push(s) } }
}

describe('runInit — new session', () => {
  it('writes initial SPAWN state when state file does not exist', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(captureWrittenState(written))
    runInit('sess123', deps)
    expect(written[0]?.state).toStrictEqual('SPAWN')
  })

  it('returns init success output with exit 0', () => {
    const deps = makeDeps()
    const result = runInit('sess123', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('Feature team initialized')
  })

  it('includes init event in event log with timestamp', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps({
      ...captureWrittenState(written),
      now: () => '2026-01-01T12:00:00.000Z',
    })
    runInit('sess123', deps)
    expect(written[0]?.eventLog[0]?.op).toStrictEqual('init')
    expect(written[0]?.eventLog[0]?.at).toStrictEqual('2026-01-01T12:00:00.000Z')
  })
})

describe('runInit — resuming session', () => {
  it('skips write when state file already exists', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps({
      stateFileExists: () => true,
      ...captureWrittenState(written),
    })
    runInit('sess123', deps)
    expect(written).toHaveLength(0)
  })

  it('returns empty output with exit 0 when resuming', () => {
    const deps = makeDeps({ stateFileExists: () => true })
    const result = runInit('sess123', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })
})

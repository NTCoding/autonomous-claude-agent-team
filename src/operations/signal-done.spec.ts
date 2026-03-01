import { runSignalDone } from './signal-done.js'
import type { SignalDoneDeps } from './signal-done.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const DEVELOPING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  commitsBlocked: true,
}
const REVIEWING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'REVIEWING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<SignalDoneDeps>,
): SignalDoneDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runSignalDone — gate check', () => {
  it('blocks when not in DEVELOPING state', () => {
    const deps = makeDeps(REVIEWING_STATE)
    const result = runSignalDone('s1', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot signal-done')
  })
})

describe('runSignalDone — success', () => {
  it('sets developerDone to true in state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(DEVELOPING_STATE, { writeState: (_, s) => { written.push(s) } })
    runSignalDone('s1', deps)
    expect(written[0]?.developerDone).toStrictEqual(true)
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(DEVELOPING_STATE)
    const result = runSignalDone('s1', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('signal-done')
  })

  it('appends signal-done event to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(DEVELOPING_STATE, { writeState: (_, s) => { written.push(s) } })
    runSignalDone('s1', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('signal-done')
  })
})

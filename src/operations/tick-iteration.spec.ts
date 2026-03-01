import { runTickIteration } from './tick-iteration.js'
import type { TickIterationDeps } from './tick-iteration.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const COMMITTING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'COMMITTING' }
const DEVELOPING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'DEVELOPING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<TickIterationDeps>,
): TickIterationDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    tickFirstUncheckedIteration: () => undefined,
    ...overrides,
  }
}

describe('runTickIteration — gate check', () => {
  it('blocks when not in COMMITTING state', () => {
    const result = runTickIteration('s1', 42, makeDeps(DEVELOPING_STATE))
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot tick-iteration')
  })
})

describe('runTickIteration — success', () => {
  it('calls tickFirstUncheckedIteration with the provided issue number', () => {
    const calledWith: number[] = []
    const deps = makeDeps(COMMITTING_STATE, {
      tickFirstUncheckedIteration: (n) => { calledWith.push(n) },
    })
    runTickIteration('s1', 42, deps)
    expect(calledWith[0]).toStrictEqual(42)
  })

  it('returns success output and exit 0', () => {
    const result = runTickIteration('s1', 42, makeDeps(COMMITTING_STATE))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('tick-iteration')
  })

  it('appends event with issue number to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(COMMITTING_STATE, { writeState: (_, s) => { written.push(s) } })
    runTickIteration('s1', 42, deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('tick-iteration')
  })
})

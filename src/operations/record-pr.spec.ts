import { runRecordPr } from './record-pr.js'
import type { RecordPrDeps } from './record-pr.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PR_CREATION_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PR_CREATION' }
const FEEDBACK_STATE: WorkflowState = { ...INITIAL_STATE, state: 'FEEDBACK' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<RecordPrDeps>,
): RecordPrDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runRecordPr — gate check', () => {
  it('blocks when not in PR_CREATION state', () => {
    const deps = makeDeps(FEEDBACK_STATE)
    const result = runRecordPr('s1', 17, deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot record-pr')
  })
})

describe('runRecordPr — success', () => {
  it('writes PR number to state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PR_CREATION_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordPr('s1', 17, deps)
    expect(written[0]?.prNumber).toStrictEqual(17)
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(PR_CREATION_STATE)
    const result = runRecordPr('s1', 17, deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('record-pr')
  })

  it('appends event with PR number to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PR_CREATION_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordPr('s1', 42, deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('record-pr')
  })
})

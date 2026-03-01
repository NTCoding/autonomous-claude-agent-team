import { runRecordIssue } from './record-issue.js'
import type { RecordIssueDeps } from './record-issue.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const SPAWN_STATE: WorkflowState = { ...INITIAL_STATE }
const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<RecordIssueDeps>,
): RecordIssueDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runRecordIssue — gate check', () => {
  it('blocks when not in SPAWN state', () => {
    const deps = makeDeps(PLANNING_STATE)
    const result = runRecordIssue('s1', 42, deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot record-issue')
  })
})

describe('runRecordIssue — success', () => {
  it('writes issue number to state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(SPAWN_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordIssue('s1', 42, deps)
    expect(written[0]?.githubIssue).toStrictEqual(42)
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(SPAWN_STATE)
    const result = runRecordIssue('s1', 42, deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('record-issue')
  })

  it('appends event with issue number to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(SPAWN_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordIssue('s1', 99, deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('record-issue')
  })
})

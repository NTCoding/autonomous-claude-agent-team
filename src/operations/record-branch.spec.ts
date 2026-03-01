import { runRecordBranch } from './record-branch.js'
import type { RecordBranchDeps } from './record-branch.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
const SPAWN_STATE: WorkflowState = { ...INITIAL_STATE }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<RecordBranchDeps>,
): RecordBranchDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runRecordBranch — gate check', () => {
  it('blocks when not in PLANNING state', () => {
    const deps = makeDeps(SPAWN_STATE)
    const result = runRecordBranch('s1', 'feature/x', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot record-branch')
  })
})

describe('runRecordBranch — success', () => {
  it('writes feature branch name to state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PLANNING_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordBranch('s1', 'feature/add-invoice', deps)
    expect(written[0]?.featureBranch).toStrictEqual('feature/add-invoice')
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(PLANNING_STATE)
    const result = runRecordBranch('s1', 'feature/x', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('record-branch')
  })

  it('appends event with branch name to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PLANNING_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordBranch('s1', 'feature/x', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('record-branch')
  })
})

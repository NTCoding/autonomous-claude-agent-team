import { runAssignIterationTask } from './assign-iteration-task.js'
import type { AssignIterationTaskDeps } from './assign-iteration-task.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const RESPAWN_STATE: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN' }
const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<AssignIterationTaskDeps>,
): AssignIterationTaskDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runAssignIterationTask — gate check', () => {
  it('blocks when not in RESPAWN state', () => {
    const deps = makeDeps(PLANNING_STATE)
    const result = runAssignIterationTask('s1', 'Iteration 1: Add feature', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot assign-iteration-task')
  })
})

describe('runAssignIterationTask — success', () => {
  it('writes task to currentIterationTask in state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(RESPAWN_STATE, { writeState: (_, s) => { written.push(s) } })
    runAssignIterationTask('s1', 'Iteration 1: Add invoice', deps)
    expect(written[0]?.currentIterationTask).toStrictEqual('Iteration 1: Add invoice')
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(RESPAWN_STATE)
    const result = runAssignIterationTask('s1', 'Iteration 1', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('assign-iteration-task')
  })

  it('appends event with task to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(RESPAWN_STATE, { writeState: (_, s) => { written.push(s) } })
    runAssignIterationTask('s1', 'Task A', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('assign-iteration-task')
  })
})

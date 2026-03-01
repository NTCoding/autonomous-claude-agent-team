import { runRecordPlanApproval } from './record-plan-approval.js'
import type { RecordPlanApprovalDeps } from './record-plan-approval.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
const SPAWN_STATE: WorkflowState = { ...INITIAL_STATE }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<RecordPlanApprovalDeps>,
): RecordPlanApprovalDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runRecordPlanApproval — gate check', () => {
  it('blocks when not in PLANNING state', () => {
    const deps = makeDeps(SPAWN_STATE)
    const result = runRecordPlanApproval('s1', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot record-plan-approval')
  })
})

describe('runRecordPlanApproval — success', () => {
  it('sets userApprovedPlan to true in state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PLANNING_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordPlanApproval('s1', deps)
    expect(written[0]?.userApprovedPlan).toStrictEqual(true)
  })

  it('returns success output and exit 0', () => {
    const deps = makeDeps(PLANNING_STATE)
    const result = runRecordPlanApproval('s1', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('record-plan-approval')
  })

  it('appends event to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PLANNING_STATE, { writeState: (_, s) => { written.push(s) } })
    runRecordPlanApproval('s1', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('record-plan-approval')
  })
})

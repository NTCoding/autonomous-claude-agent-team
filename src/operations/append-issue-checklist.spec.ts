import { runAppendIssueChecklist } from './append-issue-checklist.js'
import type { AppendIssueChecklistDeps } from './append-issue-checklist.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
const DEVELOPING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'DEVELOPING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<AppendIssueChecklistDeps>,
): AppendIssueChecklistDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    appendIssueChecklist: () => undefined,
    ...overrides,
  }
}

describe('runAppendIssueChecklist — gate check', () => {
  it('blocks when not in PLANNING state', () => {
    const result = runAppendIssueChecklist('s1', 42, '- [ ] Task 1', makeDeps(DEVELOPING_STATE))
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot append-issue-checklist')
  })
})

describe('runAppendIssueChecklist — success', () => {
  it('calls appendIssueChecklist with the provided issue number and checklist', () => {
    const calls: { issueNumber: number; checklist: string }[] = []
    const deps = makeDeps(PLANNING_STATE, {
      appendIssueChecklist: (issueNumber, checklist) => { calls.push({ issueNumber, checklist }) },
    })
    runAppendIssueChecklist('s1', 42, '- [ ] Iteration 1: task', deps)
    expect(calls[0]).toStrictEqual({ issueNumber: 42, checklist: '- [ ] Iteration 1: task' })
  })

  it('returns success output and exit 0', () => {
    const result = runAppendIssueChecklist('s1', 42, '- [ ] Task', makeDeps(PLANNING_STATE))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('append-issue-checklist')
  })

  it('appends event with issue number to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PLANNING_STATE, { writeState: (_, s) => { written.push(s) } })
    runAppendIssueChecklist('s1', 42, '- [ ] Task', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('append-issue-checklist')
  })
})

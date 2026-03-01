import { runCreatePr } from './create-pr.js'
import type { CreatePrDeps } from './create-pr.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PR_CREATION_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PR_CREATION' }
const DEVELOPING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'DEVELOPING' }

function makeDeps(
  stateToReturn: WorkflowState,
  overrides?: Partial<CreatePrDeps>,
): CreatePrDeps {
  return {
    readState: () => stateToReturn,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00.000Z',
    createDraftPr: () => 99,
    ...overrides,
  }
}

describe('runCreatePr — gate check', () => {
  it('blocks when not in PR_CREATION state', () => {
    const result = runCreatePr('s1', 'My PR', 'body', makeDeps(DEVELOPING_STATE))
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot create-pr')
  })
})

describe('runCreatePr — success', () => {
  it('calls createDraftPr with the provided title and body', () => {
    const calls: { title: string; body: string }[] = []
    const deps = makeDeps(PR_CREATION_STATE, {
      createDraftPr: (title, body) => { calls.push({ title, body }); return 42 },
    })
    runCreatePr('s1', 'My title', 'My body', deps)
    expect(calls[0]).toStrictEqual({ title: 'My title', body: 'My body' })
  })

  it('writes returned PR number to state', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PR_CREATION_STATE, {
      createDraftPr: () => 77,
      writeState: (_, s) => { written.push(s) },
    })
    runCreatePr('s1', 'Title', 'Body', deps)
    expect(written[0]?.prNumber).toStrictEqual(77)
  })

  it('returns success output and exit 0', () => {
    const result = runCreatePr('s1', 'Title', 'Body', makeDeps(PR_CREATION_STATE))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('create-pr')
  })

  it('appends event with PR number to log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps(PR_CREATION_STATE, {
      createDraftPr: () => 55,
      writeState: (_, s) => { written.push(s) },
    })
    runCreatePr('s1', 'Title', 'Body', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('create-pr')
  })
})

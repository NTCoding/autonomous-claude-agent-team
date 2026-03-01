import { runTransition } from './transition.js'
import type { TransitionDeps } from './transition.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'
import type { GitInfo } from '../domain/preconditions.js'

const CLEAN_GIT: GitInfo = {
  currentBranch: 'main',
  workingTreeClean: true,
  headCommit: 'abc123',
  changedFilesVsDefault: [],
  hasCommitsVsDefault: false,
}

const SPAWN_STATE: WorkflowState = {
  ...INITIAL_STATE,
  githubIssue: 42,
  activeAgents: ['developer-1', 'reviewer-1'],
}

function makeDeps(overrides?: Partial<TransitionDeps>): TransitionDeps {
  return {
    readState: () => SPAWN_STATE,
    writeState: () => undefined,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    getGitInfo: () => CLEAN_GIT,
    checkPrChecks: () => true,
    readFile: () => '# STATE\n\n## TODO\n\n- [ ] Do something',
    getPluginRoot: () => '/test/plugin',
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('runTransition — legal transition', () => {
  it('writes updated state and returns success output', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps({ writeState: (_, s) => { written.push(s) } })
    const result = runTransition('s1', 'PLANNING', deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(written[0]?.state).toStrictEqual('PLANNING')
  })

  it('appends transition event to event log', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps({ writeState: (_, s) => { written.push(s) } })
    runTransition('s1', 'PLANNING', deps)
    const lastEntry = written[0]?.eventLog.at(-1)
    expect(lastEntry?.op).toStrictEqual('transition')
  })

  it('output contains destination state name', () => {
    const deps = makeDeps()
    const result = runTransition('s1', 'PLANNING', deps)
    expect(result.output).toContain('PLANNING')
  })
})

describe('runTransition — illegal transition', () => {
  it('returns EXIT_BLOCK when transition is not in map', () => {
    const deps = makeDeps()
    const result = runTransition('s1', 'COMPLETE', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Illegal transition')
  })

  it('includes current state procedure in illegal transition error', () => {
    const deps = makeDeps()
    const result = runTransition('s1', 'COMPLETE', deps)
    expect(result.output).toContain('Do something')
  })

  it('does not write state on illegal transition', () => {
    const written: WorkflowState[] = []
    const deps = makeDeps({ writeState: (_, s) => { written.push(s) } })
    runTransition('s1', 'COMPLETE', deps)
    expect(written).toHaveLength(0)
  })
})

describe('runTransition — precondition failure', () => {
  it('returns EXIT_BLOCK when preconditions not met', () => {
    const planningState: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
    const deps = makeDeps({
      readState: () => planningState,
      getGitInfo: () => ({ ...CLEAN_GIT, workingTreeClean: false }),
    })
    const result = runTransition('s1', 'RESPAWN', deps)
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Cannot transition to RESPAWN')
  })

  it('includes current state procedure in precondition error', () => {
    const planningState: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
    const deps = makeDeps({
      readState: () => planningState,
      getGitInfo: () => ({ ...CLEAN_GIT, workingTreeClean: false }),
    })
    const result = runTransition('s1', 'RESPAWN', deps)
    expect(result.output).toContain('Do something')
  })
})

describe('runTransition — COMPLETE precondition with PR checks', () => {
  it('runs PR checks when transitioning to COMPLETE', () => {
    const feedbackState: WorkflowState = {
      ...INITIAL_STATE,
      state: 'FEEDBACK',
      prNumber: 42,
    }
    const deps = makeDeps({
      readState: () => feedbackState,
      checkPrChecks: () => true,
    })
    const result = runTransition('s1', 'COMPLETE', deps)
    expect(result.exitCode).toStrictEqual(0)
  })

  it('blocks COMPLETE when PR checks fail', () => {
    const feedbackState: WorkflowState = {
      ...INITIAL_STATE,
      state: 'FEEDBACK',
      prNumber: 42,
    }
    const deps = makeDeps({
      readState: () => feedbackState,
      checkPrChecks: () => false,
    })
    const result = runTransition('s1', 'COMPLETE', deps)
    expect(result.exitCode).toStrictEqual(2)
  })

  it('blocks COMPLETE when prNumber is not set', () => {
    const feedbackState: WorkflowState = { ...INITIAL_STATE, state: 'FEEDBACK' }
    const deps = makeDeps({ readState: () => feedbackState })
    const result = runTransition('s1', 'COMPLETE', deps)
    expect(result.exitCode).toStrictEqual(2)
  })
})

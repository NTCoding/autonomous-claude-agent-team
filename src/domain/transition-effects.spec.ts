import { applyTransitionEffects } from './transition-effects.js'
import { INITIAL_STATE } from './workflow-state.js'
import type { WorkflowState } from './workflow-state.js'

const devState: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  iteration: 1,
  commitsBlocked: true,
  developerDone: true,
  developingHeadCommit: 'abc123',
  lintedFiles: ['src/foo.ts'],
}

describe('applyTransitionEffects — commit blocking', () => {
  it('sets commitsBlocked true when entering DEVELOPING', () => {
    const result = applyTransitionEffects('RESPAWN', 'DEVELOPING', INITIAL_STATE, 'abc')
    expect(result.commitsBlocked).toStrictEqual(true)
  })

  it('sets commitsBlocked true when entering REVIEWING', () => {
    const result = applyTransitionEffects('DEVELOPING', 'REVIEWING', devState, 'abc')
    expect(result.commitsBlocked).toStrictEqual(true)
  })

  it('sets commitsBlocked false when entering COMMITTING', () => {
    const state = { ...devState, state: 'REVIEWING' as const }
    const result = applyTransitionEffects('REVIEWING', 'COMMITTING', state, 'abc')
    expect(result.commitsBlocked).toStrictEqual(false)
  })

  it('sets commitsBlocked false when entering other states', () => {
    const result = applyTransitionEffects('SPAWN', 'PLANNING', INITIAL_STATE, 'abc')
    expect(result.commitsBlocked).toStrictEqual(false)
  })
})

describe('applyTransitionEffects — entering BLOCKED', () => {
  it('saves preBlockedState when entering BLOCKED', () => {
    const result = applyTransitionEffects('DEVELOPING', 'BLOCKED', devState, 'abc')
    expect(result.preBlockedState).toStrictEqual('DEVELOPING')
  })

  it('sets state to BLOCKED', () => {
    const result = applyTransitionEffects('DEVELOPING', 'BLOCKED', devState, 'abc')
    expect(result.state).toStrictEqual('BLOCKED')
  })
})

describe('applyTransitionEffects — exiting BLOCKED', () => {
  it('clears preBlockedState when leaving BLOCKED', () => {
    const blocked = { ...devState, state: 'BLOCKED' as const, preBlockedState: 'DEVELOPING' as const }
    const result = applyTransitionEffects('BLOCKED', 'DEVELOPING', blocked, 'abc')
    expect(result.preBlockedState).toBeUndefined()
  })

  it('restores state when leaving BLOCKED', () => {
    const blocked = { ...devState, state: 'BLOCKED' as const, preBlockedState: 'DEVELOPING' as const }
    const result = applyTransitionEffects('BLOCKED', 'DEVELOPING', blocked, 'abc')
    expect(result.state).toStrictEqual('DEVELOPING')
  })
})

describe('applyTransitionEffects — RESPAWN -> DEVELOPING', () => {
  const respawnState: WorkflowState = {
    ...INITIAL_STATE, state: 'RESPAWN', iteration: 0, lintedFiles: ['old.ts'],
  }

  it('increments iteration', () => {
    const result = applyTransitionEffects('RESPAWN', 'DEVELOPING', respawnState, 'def456')
    expect(result.iteration).toStrictEqual(1)
  })

  it('resets developerDone to false', () => {
    const state = { ...respawnState, developerDone: true }
    const result = applyTransitionEffects('RESPAWN', 'DEVELOPING', state, 'def456')
    expect(result.developerDone).toStrictEqual(false)
  })

  it('sets developingHeadCommit to new head', () => {
    const result = applyTransitionEffects('RESPAWN', 'DEVELOPING', respawnState, 'def456')
    expect(result.developingHeadCommit).toStrictEqual('def456')
  })

  it('clears lintedFiles', () => {
    const result = applyTransitionEffects('RESPAWN', 'DEVELOPING', respawnState, 'def456')
    expect(result.lintedFiles).toStrictEqual([])
  })
})

describe('applyTransitionEffects — REVIEWING -> DEVELOPING (rejection)', () => {
  it('resets developerDone without incrementing iteration', () => {
    const state = { ...devState, state: 'REVIEWING' as const, developerDone: true, iteration: 2 }
    const result = applyTransitionEffects('REVIEWING', 'DEVELOPING', state, 'xyz')
    expect(result.developerDone).toStrictEqual(false)
    expect(result.iteration).toStrictEqual(2)
  })

  it('records new developingHeadCommit and clears lintedFiles', () => {
    const state = { ...devState, state: 'REVIEWING' as const, lintedFiles: ['a.ts', 'b.ts'] }
    const result = applyTransitionEffects('REVIEWING', 'DEVELOPING', state, 'xyz')
    expect(result.developingHeadCommit).toStrictEqual('xyz')
    expect(result.lintedFiles).toStrictEqual([])
  })
})

describe('applyTransitionEffects — transitioning to RESPAWN', () => {
  it('clears currentIterationTask when entering RESPAWN', () => {
    const state = { ...devState, state: 'COMMITTING' as const, currentIterationTask: 'Iteration 1' }
    const result = applyTransitionEffects('COMMITTING', 'RESPAWN', state, 'abc')
    expect(result.currentIterationTask).toBeUndefined()
  })
})

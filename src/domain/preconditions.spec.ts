import { checkPreconditions } from './preconditions.js'
import type { GitInfo } from './preconditions.js'
import { INITIAL_STATE } from './workflow-state.js'
import type { WorkflowState } from './workflow-state.js'

const cleanGit: GitInfo = {
  currentBranch: 'feature/foo',
  workingTreeClean: true,
  headCommit: 'abc123',
  changedFilesVsDefault: [],
  hasCommitsVsDefault: true,
}

const dirtyGit: GitInfo = { ...cleanGit, workingTreeClean: false }

const baseState: WorkflowState = {
  ...INITIAL_STATE,
  featureBranch: 'feature/foo',
  githubIssue: 42,
}

describe('checkPreconditions — BLOCKED always passes', () => {
  it('passes for any -> BLOCKED', () => {
    const result = checkPreconditions('DEVELOPING', 'BLOCKED', baseState, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })

  it('passes for BLOCKED -> any (legality enforced by transition-map)', () => {
    const result = checkPreconditions('BLOCKED', 'DEVELOPING', baseState, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — any -> DEVELOPING', () => {
  it('passes when branch matches and githubIssue is set', () => {
    const state = { ...baseState, state: 'REVIEWING' as const }
    const result = checkPreconditions('REVIEWING', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })

  it('fails when branch does not match', () => {
    const state = { ...baseState, state: 'RESPAWN' as const, featureBranch: 'feature/other' }
    const result = checkPreconditions('RESPAWN', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('feature/other')
  })

  it('fails when githubIssue is not set', () => {
    const state = { ...INITIAL_STATE, featureBranch: 'feature/foo' }
    const result = checkPreconditions('REVIEWING', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('githubIssue')
  })

  it('passes when featureBranch is not set yet', () => {
    const state = { ...INITIAL_STATE, githubIssue: 42, state: 'REVIEWING' as const }
    const result = checkPreconditions('REVIEWING', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — RESPAWN -> DEVELOPING', () => {
  it('fails when currentIterationTask is not set', () => {
    const state = { ...baseState, state: 'RESPAWN' as const }
    const result = checkPreconditions('RESPAWN', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('currentIterationTask')
  })

  it('fails when activeAgents are still alive', () => {
    const state = {
      ...baseState, state: 'RESPAWN' as const,
      currentIterationTask: 'Iteration 1: Foo',
      activeAgents: ['developer-1'],
    }
    const result = checkPreconditions('RESPAWN', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) {
      expect(result.reason).toContain('developer-1')
      expect(result.reason).toContain('shut-down')
    }
  })

  it('passes when task set and no active agents', () => {
    const state = { ...baseState, state: 'RESPAWN' as const, currentIterationTask: 'Iteration 1: Foo' }
    const result = checkPreconditions('RESPAWN', 'DEVELOPING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — DEVELOPING -> REVIEWING', () => {
  it('fails when developerDone is false', () => {
    const state = { ...baseState, state: 'DEVELOPING' as const }
    const result = checkPreconditions('DEVELOPING', 'REVIEWING', state, dirtyGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('developerDone')
  })

  it('fails when working tree is clean (no changes)', () => {
    const state = { ...baseState, state: 'DEVELOPING' as const, developerDone: true }
    const result = checkPreconditions('DEVELOPING', 'REVIEWING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('uncommitted')
  })

  it('fails when new commits since DEVELOPING started', () => {
    const state = {
      ...baseState, state: 'DEVELOPING' as const, developerDone: true,
      developingHeadCommit: 'abc123',
    }
    const git = { ...dirtyGit, headCommit: 'def456' }
    const result = checkPreconditions('DEVELOPING', 'REVIEWING', state, git, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('abc123')
  })

  it('passes when developerDone, dirty tree, and no new commits', () => {
    const state = {
      ...baseState, state: 'DEVELOPING' as const, developerDone: true,
      developingHeadCommit: 'abc123',
    }
    const result = checkPreconditions('DEVELOPING', 'REVIEWING', state, dirtyGit, true)
    expect(result.pass).toStrictEqual(true)
  })

  it('passes when developingHeadCommit is not set', () => {
    const state = { ...baseState, state: 'DEVELOPING' as const, developerDone: true }
    const result = checkPreconditions('DEVELOPING', 'REVIEWING', state, dirtyGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — PLANNING -> RESPAWN', () => {
  it('fails when userApprovedPlan is false', () => {
    const state = { ...baseState, state: 'PLANNING' as const }
    const result = checkPreconditions('PLANNING', 'RESPAWN', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('userApprovedPlan')
  })

  it('fails when working tree is dirty', () => {
    const state = { ...baseState, state: 'PLANNING' as const, userApprovedPlan: true }
    const result = checkPreconditions('PLANNING', 'RESPAWN', state, dirtyGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('clean')
  })

  it('passes when plan approved and tree clean', () => {
    const state = { ...baseState, state: 'PLANNING' as const, userApprovedPlan: true }
    const result = checkPreconditions('PLANNING', 'RESPAWN', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — COMMITTING exit', () => {
  const committingState: WorkflowState = {
    ...baseState,
    state: 'COMMITTING' as const,
    iteration: 1,
    lintRanIteration: 1,
    lintedFiles: ['src/foo.ts'],
  }

  it('fails when working tree is dirty', () => {
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', committingState, dirtyGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('Uncommitted')
  })

  it('fails when lint iteration does not match for TypeScript files', () => {
    const state = { ...committingState, lintRanIteration: 0 }
    const git = { ...cleanGit, changedFilesVsDefault: ['src/foo.ts'], hasCommitsVsDefault: true }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', state, git, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('lint_ran_iteration')
  })

  it('fails when changed files have unlinted files', () => {
    const git = { ...cleanGit, changedFilesVsDefault: ['src/foo.ts', 'src/bar.ts'] }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', committingState, git, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('src/bar.ts')
  })

  it('fails when no commits beyond default branch', () => {
    const git = { ...cleanGit, changedFilesVsDefault: [], hasCommitsVsDefault: false }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', committingState, git, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('No commits')
  })

  it('passes when all conditions met', () => {
    const git = { ...cleanGit, changedFilesVsDefault: ['src/foo.ts'] }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', committingState, git, true)
    expect(result.pass).toStrictEqual(true)
  })

  it('passes when only non-TypeScript files changed (no lint required)', () => {
    const state = { ...committingState, lintRanIteration: -1, lintedFiles: [] }
    const git = {
      ...cleanGit,
      changedFilesVsDefault: ['docs/guide.md', 'package.json'],
      hasCommitsVsDefault: true,
    }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', state, git, true)
    expect(result.pass).toStrictEqual(true)
  })

  it('fails lint check for TypeScript files even when non-TypeScript files also changed', () => {
    const state = { ...committingState, lintRanIteration: 1, lintedFiles: [] }
    const git = {
      ...cleanGit,
      changedFilesVsDefault: ['src/bar.ts', 'docs/guide.md'],
      hasCommitsVsDefault: true,
    }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', state, git, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('src/bar.ts')
  })

  it('does not mention non-TypeScript files in unlinted files error', () => {
    const state = { ...committingState, lintRanIteration: 1, lintedFiles: [] }
    const git = {
      ...cleanGit,
      changedFilesVsDefault: ['src/bar.ts', 'docs/guide.md'],
      hasCommitsVsDefault: true,
    }
    const result = checkPreconditions('COMMITTING', 'CR_REVIEW', state, git, true)
    if (!result.pass) expect(result.reason).not.toContain('docs/guide.md')
  })
})

describe('checkPreconditions — FEEDBACK -> COMPLETE', () => {
  it('fails when prNumber not set', () => {
    const state = { ...baseState, state: 'FEEDBACK' as const }
    const result = checkPreconditions('FEEDBACK', 'COMPLETE', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('prNumber')
  })

  it('fails when PR checks are not passing', () => {
    const state = { ...baseState, state: 'FEEDBACK' as const, prNumber: 17 }
    const result = checkPreconditions('FEEDBACK', 'COMPLETE', state, cleanGit, false)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('#17')
  })

  it('passes when prNumber set and checks pass', () => {
    const state = { ...baseState, state: 'FEEDBACK' as const, prNumber: 17 }
    const result = checkPreconditions('FEEDBACK', 'COMPLETE', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — SPAWN -> PLANNING', () => {
  it('fails when githubIssue is not set', () => {
    const state = { ...INITIAL_STATE, state: 'SPAWN' as const }
    const result = checkPreconditions('SPAWN', 'PLANNING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('githubIssue')
  })

  it('fails when no developer agent is spawned', () => {
    const state = { ...INITIAL_STATE, state: 'SPAWN' as const, githubIssue: 42 }
    const result = checkPreconditions('SPAWN', 'PLANNING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('developer')
  })

  it('fails when no reviewer agent is spawned', () => {
    const state = {
      ...INITIAL_STATE, state: 'SPAWN' as const, githubIssue: 42,
      activeAgents: ['developer-1'],
    }
    const result = checkPreconditions('SPAWN', 'PLANNING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(false)
    if (!result.pass) expect(result.reason).toContain('reviewer')
  })

  it('passes when issue set and both agents spawned', () => {
    const state = {
      ...INITIAL_STATE, state: 'SPAWN' as const, githubIssue: 42,
      activeAgents: ['developer-1', 'reviewer-1'],
    }
    const result = checkPreconditions('SPAWN', 'PLANNING', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — COMMITTING -> RESPAWN', () => {
  it('applies committing exit checks for RESPAWN target', () => {
    const state: WorkflowState = {
      ...baseState,
      state: 'COMMITTING' as const,
      iteration: 1,
      lintRanIteration: 1,
      lintedFiles: ['src/foo.ts'],
    }
    const git = { ...cleanGit, changedFilesVsDefault: ['src/foo.ts'] }
    const result = checkPreconditions('COMMITTING', 'RESPAWN', state, git, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — FEEDBACK -> RESPAWN', () => {
  it('passes without conditions for revision loop', () => {
    const state: WorkflowState = { ...baseState, state: 'FEEDBACK' as const }
    const result = checkPreconditions('FEEDBACK', 'RESPAWN', state, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

describe('checkPreconditions — default pass', () => {
  it('passes for transitions with no specific preconditions', () => {
    const result = checkPreconditions('CR_REVIEW', 'PR_CREATION', baseState, cleanGit, true)
    expect(result.pass).toStrictEqual(true)
  })
})

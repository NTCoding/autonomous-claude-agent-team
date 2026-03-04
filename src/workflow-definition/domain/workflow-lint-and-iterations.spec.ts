import { Workflow } from '../index.js'
import type { WorkflowDeps } from '../index.js'
import type { WorkflowState, IterationState } from '../../workflow-engine/index.js'
import { INITIAL_STATE } from './workflow-types.js'
import type { GitInfo } from '../../workflow-dsl/index.js'

const cleanGit: GitInfo = {
  currentBranch: 'feature/test',
  workingTreeClean: true,
  headCommit: 'abc123',
  changedFilesVsDefault: [],
  hasCommitsVsDefault: false,
}

const dirtyGit: GitInfo = {
  ...cleanGit,
  workingTreeClean: false,
}

function makeDeps(overrides?: Partial<WorkflowDeps>): WorkflowDeps {
  return {
    getGitInfo: () => cleanGit,
    checkPrChecks: () => true,
    createDraftPr: () => 99,
    appendIssueChecklist: () => undefined,
    tickFirstUncheckedIteration: () => undefined,
    runEslintOnFiles: () => true,
    fileExists: () => true,
    getPluginRoot: () => '/plugin',
    now: () => '2026-01-01T00:00:00Z',
    readTranscriptMessages: () => [],
    ...overrides,
  }
}

const DEFAULT_ITERATION: IterationState = {
  task: 'test task',
  developerDone: false,
  reviewApproved: false,
  reviewRejected: false,
  coderabbitFeedbackAddressed: false,
  coderabbitFeedbackIgnored: false,
  lintedFiles: [],
  lintRanIteration: false,
}

function stateWith(overrides: Partial<WorkflowState>): WorkflowState {
  return { ...INITIAL_STATE, ...overrides }
}

describe('Workflow', () => {
  describe('runLint', () => {
    it('records linted files when lint passes', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.runLint(['src/a.ts', 'src/b.tsx'])
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual(['src/a.ts', 'src/b.tsx'])
      expect(wf.getState().iterations[0]?.lintRanIteration).toBe(true)
    })

    it('records 0 files when no TS files', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.runLint(['README.md'])
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual([])
      expect(wf.getState().iterations[0]?.lintRanIteration).toBe(true)
    })

    it('returns fail when lint fails', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ runEslintOnFiles: () => false }))
      const result = wf.runLint(['src/a.ts'])
      expect(result.pass).toBe(false)
    })

    it('throws when no iteration entry', () => {
      const state = stateWith({ state: 'DEVELOPING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.runLint(['src/a.ts'])).toThrow('No iteration entry at index 0')
    })

    it('filters out non-existent files', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ fileExists: () => false }))
      const result = wf.runLint(['src/a.ts'])
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual([])
    })

    it('merges with existing linted files', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, lintedFiles: ['src/existing.ts'] }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.runLint(['src/new.ts'])
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual(['src/existing.ts', 'src/new.ts'])
    })

    it('deduplicates linted files', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, lintedFiles: ['src/a.ts'] }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.runLint(['src/a.ts'])
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual(['src/a.ts'])
    })

    it('calls runEslintOnFiles with correct config path', () => {
      const mockLint = vi.fn().mockReturnValue(true)
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ runEslintOnFiles: mockLint }))
      wf.runLint(['src/a.ts'])
      expect(mockLint).toHaveBeenCalledWith('/plugin/lint/eslint.config.mjs', ['src/a.ts'])
    })
  })

  describe('pending events', () => {
    it('emits transitioned event for transition', () => {
      const state = stateWith({
        state: 'PLANNING',
        userApprovedPlan: true,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('RESPAWN')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'PLANNING', to: 'RESPAWN' })])
      )
    })

    it('emits transitioned event for BLOCKED transition', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('BLOCKED')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'PLANNING', to: 'BLOCKED' })])
      )
    })

    it('emits transitioned event for unblock transition', () => {
      const state = stateWith({
        state: 'BLOCKED',
        preBlockedState: 'PLANNING',
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('PLANNING')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'BLOCKED', to: 'PLANNING' })])
      )
    })
  })

  describe('operations with multiple iterations', () => {
    it('signalDone only updates the current iteration', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.signalDone()
      expect(wf.getState().iterations[0]?.developerDone).toBe(false)
      expect(wf.getState().iterations[1]?.developerDone).toBe(true)
    })

    it('reviewApproved only updates the current iteration', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.reviewApproved()
      expect(wf.getState().iterations[0]?.reviewApproved).toBe(false)
      expect(wf.getState().iterations[1]?.reviewApproved).toBe(true)
    })

    it('reviewRejected only updates the current iteration', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.reviewRejected()
      expect(wf.getState().iterations[0]?.reviewRejected).toBe(false)
      expect(wf.getState().iterations[1]?.reviewRejected).toBe(true)
    })

    it('coderabbitFeedbackAddressed only updates the current iteration', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.coderabbitFeedbackAddressed()
      expect(wf.getState().iterations[0]?.coderabbitFeedbackAddressed).toBe(false)
      expect(wf.getState().iterations[1]?.coderabbitFeedbackAddressed).toBe(true)
    })

    it('coderabbitFeedbackIgnored only updates the current iteration', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.coderabbitFeedbackIgnored()
      expect(wf.getState().iterations[0]?.coderabbitFeedbackIgnored).toBe(false)
      expect(wf.getState().iterations[1]?.coderabbitFeedbackIgnored).toBe(true)
    })

    it('runLint with no TS files only updates the current iteration', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.runLint(['README.md'])
      expect(wf.getState().iterations[0]?.lintRanIteration).toBe(false)
      expect(wf.getState().iterations[1]?.lintRanIteration).toBe(true)
    })

    it('runLint with TS files only updates the current iteration', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iteration: 1,
        iterations: [DEFAULT_ITERATION, DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.runLint(['src/a.ts'])
      expect(wf.getState().iterations[0]?.lintedFiles).toStrictEqual([])
      expect(wf.getState().iterations[1]?.lintedFiles).toStrictEqual(['src/a.ts'])
    })
  })
})

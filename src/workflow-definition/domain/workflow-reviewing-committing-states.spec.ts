import { Workflow } from '../index.js'
import type { WorkflowDeps } from '../index.js'
import type { WorkflowState, IterationState } from './workflow-types.js'
import { INITIAL_STATE } from './workflow-types.js'
import type { GitInfo } from '@ntcoding/agentic-workflow-builder/dsl'

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
  describe('REVIEWING state', () => {
    it('transitions to COMMITTING when reviewApproved', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [{ ...DEFAULT_ITERATION, reviewApproved: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMMITTING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().currentStateMachineState).toBe('COMMITTING')
    })

    it('fails transition to COMMITTING when not approved', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMMITTING')
      expect(result.pass).toBe(false)
    })

    it('transitions to DEVELOPING when reviewRejected', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [{ ...DEFAULT_ITERATION, reviewRejected: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition to DEVELOPING when not rejected', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result.pass).toBe(false)
    })

    it('sets reviewApproved when reviewApproved succeeds', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.reviewApproved()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.reviewApproved).toBe(true)
    })

    it('fails reviewApproved in non-REVIEWING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.reviewApproved()
      expect(result.pass).toBe(false)
    })

    it('throws reviewApproved when no iteration', () => {
      const state = stateWith({ currentStateMachineState: 'REVIEWING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.reviewApproved()).toThrow('No iteration at index 0')
    })

    it('sets reviewRejected when reviewRejected succeeds', () => {
      const state = stateWith({
        currentStateMachineState: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.reviewRejected()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.reviewRejected).toBe(true)
    })

    it('fails reviewRejected in non-REVIEWING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.reviewRejected()
      expect(result.pass).toBe(false)
    })

    it('throws reviewRejected when no iteration', () => {
      const state = stateWith({ currentStateMachineState: 'REVIEWING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.reviewRejected()).toThrow('No iteration at index 0')
    })
  })

  describe('COMMITTING state', () => {
    it('transitions to RESPAWN when clean tree and linted and has commits', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [{ ...DEFAULT_ITERATION, lintRanIteration: true, lintedFiles: ['src/a.ts'] }],
      })
      const gitWithCommits: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithCommits }))
      const result = wf.transitionTo('RESPAWN')
      expect(result).toStrictEqual({ pass: true })
    })

    it('transitions to CR_REVIEW when clean tree and linted and has commits', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [{ ...DEFAULT_ITERATION, lintRanIteration: true, lintedFiles: ['src/a.ts'] }],
      })
      const gitWithCommits: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithCommits }))
      const result = wf.transitionTo('CR_REVIEW')
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition when dirty tree', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('fails transition when lint not run', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const gitWithFiles: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithFiles }))
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('fails transition when unlinted files exist', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [{ ...DEFAULT_ITERATION, lintRanIteration: true, lintedFiles: ['src/a.ts'] }],
      })
      const gitWithFiles: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts', 'src/b.ts'],
      }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithFiles }))
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('fails transition when no commits beyond default', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('succeeds transition with no TS files even without lint', () => {
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const gitWithCommitsNoTs: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['README.md'],
      }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithCommitsNoTs }))
      const result = wf.transitionTo('CR_REVIEW')
      expect(result).toStrictEqual({ pass: true })
    })

    it('calls deps.tickFirstUncheckedIteration when tickIteration succeeds', () => {
      const mockTick = vi.fn()
      const state = stateWith({
        currentStateMachineState: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ tickFirstUncheckedIteration: mockTick }))
      const result = wf.tickIteration(42)
      expect(result).toStrictEqual({ pass: true })
      expect(mockTick).toHaveBeenCalledWith(42)
    })

    it('fails tickIteration in non-COMMITTING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.tickIteration(42)
      expect(result.pass).toBe(false)
    })
  })
})

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
  describe('CR_REVIEW state', () => {
    it('transitions to PR_CREATION when feedback addressed and has commits', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackAddressed: true }],
      })
      const gitWithCommits: GitInfo = { ...cleanGit, hasCommitsVsDefault: true }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithCommits }))
      const result = wf.transitionTo('PR_CREATION')
      expect(result).toStrictEqual({ pass: true })
    })

    it('transitions to PR_CREATION when feedback ignored', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackIgnored: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition when neither addressed nor ignored', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result.pass).toBe(false)
    })

    it('fails transition when addressed but no commits', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackAddressed: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result.pass).toBe(false)
    })

    it('sets coderabbitFeedbackAddressed when succeeds', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.coderabbitFeedbackAddressed()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.coderabbitFeedbackAddressed).toBe(true)
    })

    it('fails coderabbitFeedbackAddressed in non-CR_REVIEW states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.coderabbitFeedbackAddressed()
      expect(result.pass).toBe(false)
    })

    it('throws coderabbitFeedbackAddressed when no iteration', () => {
      const state = stateWith({ currentStateMachineState: 'CR_REVIEW' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.coderabbitFeedbackAddressed()).toThrow('No iteration at index 0')
    })

    it('sets coderabbitFeedbackIgnored when succeeds', () => {
      const state = stateWith({
        currentStateMachineState: 'CR_REVIEW',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.coderabbitFeedbackIgnored()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.coderabbitFeedbackIgnored).toBe(true)
    })

    it('fails coderabbitFeedbackIgnored in non-CR_REVIEW states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.coderabbitFeedbackIgnored()
      expect(result.pass).toBe(false)
    })

    it('throws coderabbitFeedbackIgnored when no iteration', () => {
      const state = stateWith({ currentStateMachineState: 'CR_REVIEW' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.coderabbitFeedbackIgnored()).toThrow('No iteration at index 0')
    })
  })

  describe('PR_CREATION state', () => {
    it('transitions to FEEDBACK when prNumber set and PR checks pass', () => {
      const state = stateWith({
        currentStateMachineState: 'PR_CREATION',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('FEEDBACK')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().currentStateMachineState).toBe('FEEDBACK')
    })

    it('fails transition when no prNumber', () => {
      const state = stateWith({ currentStateMachineState: 'PR_CREATION' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('FEEDBACK')
      expect(result.pass).toBe(false)
    })

    it('fails transition when PR checks fail', () => {
      const state = stateWith({
        currentStateMachineState: 'PR_CREATION',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps({ checkPrChecks: () => false }))
      const result = wf.transitionTo('FEEDBACK')
      expect(result.pass).toBe(false)
    })

    it('sets prNumber when recordPr succeeds', () => {
      const state = stateWith({ currentStateMachineState: 'PR_CREATION' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.recordPr(99)
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().prNumber).toBe(99)
    })

    it('fails recordPr in non-PR_CREATION states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.recordPr(99)
      expect(result.pass).toBe(false)
    })

    it('calls deps.createDraftPr and sets prNumber when createPr succeeds', () => {
      const mockCreate = vi.fn().mockReturnValue(77)
      const state = stateWith({ currentStateMachineState: 'PR_CREATION' })
      const wf = Workflow.rehydrate(state, makeDeps({ createDraftPr: mockCreate }))
      const result = wf.createPr('title', 'body')
      expect(result).toStrictEqual({ pass: true })
      expect(mockCreate).toHaveBeenCalledWith('title', 'body')
      expect(wf.getState().prNumber).toBe(77)
    })

    it('fails createPr in non-PR_CREATION states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.createPr('t', 'b')
      expect(result.pass).toBe(false)
    })
  })

  describe('FEEDBACK state', () => {
    it('transitions to COMPLETE when prNumber set and checks pass', () => {
      const state = stateWith({
        currentStateMachineState: 'FEEDBACK',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMPLETE')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().currentStateMachineState).toBe('COMPLETE')
    })

    it('fails transition to COMPLETE when no prNumber', () => {
      const state = stateWith({ currentStateMachineState: 'FEEDBACK' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMPLETE')
      expect(result.pass).toBe(false)
    })

    it('fails transition to COMPLETE when PR checks fail', () => {
      const state = stateWith({
        currentStateMachineState: 'FEEDBACK',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps({ checkPrChecks: () => false }))
      const result = wf.transitionTo('COMPLETE')
      expect(result.pass).toBe(false)
    })

    it('transitions to RESPAWN always', () => {
      const state = stateWith({ currentStateMachineState: 'FEEDBACK' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result).toStrictEqual({ pass: true })
    })
  })

  describe('BLOCKED state', () => {
    it('allows transition TO BLOCKED from any state and sets preBlockedState', () => {
      const state = stateWith({
        currentStateMachineState: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('BLOCKED')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().currentStateMachineState).toBe('BLOCKED')
      expect(wf.getState().preBlockedState).toBe('DEVELOPING')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'DEVELOPING', to: 'BLOCKED' })])
      )
    })

    it('allows transition FROM BLOCKED back to pre-blocked state', () => {
      const state = stateWith({
        currentStateMachineState: 'BLOCKED',
        iterations: [DEFAULT_ITERATION],
        preBlockedState: 'DEVELOPING',
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().currentStateMachineState).toBe('DEVELOPING')
    })

    it('fails transition FROM BLOCKED to wrong state', () => {
      const state = stateWith({
        currentStateMachineState: 'BLOCKED',
        preBlockedState: 'DEVELOPING',
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
    })

    it('includes unknown in error when not set', () => {
      const state = stateWith({ currentStateMachineState: 'BLOCKED' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('unknown')
      }
    })
  })

  describe('COMPLETE state', () => {
    it('fails all transitions since canTransitionTo is empty', () => {
      const state = stateWith({ currentStateMachineState: 'COMPLETE' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('SPAWN')
      expect(result.pass).toBe(false)
    })
  })
})

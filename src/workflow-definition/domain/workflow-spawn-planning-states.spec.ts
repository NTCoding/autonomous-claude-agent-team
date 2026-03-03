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
  describe('getAgentInstructions', () => {
    it('returns path from registry agentInstructions field', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
      expect(wf.getAgentInstructions('/plugin')).toBe('/plugin/states/spawn.md')
    })
  })

  describe('SPAWN state', () => {
    it('transitions to PLANNING when issue set and developer and reviewer agents present', () => {
      const state = stateWith({
        githubIssue: 1,
        activeAgents: ['developer-1', 'reviewer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('PLANNING')
    })

    it('fails transition to PLANNING when no githubIssue', () => {
      const state = stateWith({
        activeAgents: ['developer-1', 'reviewer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to PLANNING when no developer agent', () => {
      const state = stateWith({
        githubIssue: 1,
        activeAgents: ['reviewer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to PLANNING when no reviewer agent', () => {
      const state = stateWith({
        githubIssue: 1,
        activeAgents: ['developer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to non-PLANNING states', () => {
      const state = stateWith({
        githubIssue: 1,
        activeAgents: ['developer-1', 'reviewer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result.pass).toBe(false)
    })

    it('sets githubIssue and emits event when recordIssue succeeds', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.recordIssue(42)
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().githubIssue).toBe(42)
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'issue-recorded', issueNumber: 42 })])
      )
    })

    it('fails recordIssue in non-SPAWN states', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.recordIssue(42)
      expect(result.pass).toBe(false)
    })
  })

  describe('PLANNING state', () => {
    it('transitions to RESPAWN when plan approved and clean tree', () => {
      const state = stateWith({
        state: 'PLANNING',
        userApprovedPlan: true,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('RESPAWN')
    })

    it('fails transition to RESPAWN when plan not approved', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('fails transition to RESPAWN when dirty tree', () => {
      const state = stateWith({
        state: 'PLANNING',
        userApprovedPlan: true,
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('sets featureBranch when recordBranch succeeds', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.recordBranch('feature/x')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().featureBranch).toBe('feature/x')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'branch-recorded', branch: 'feature/x' })])
      )
    })

    it('fails recordBranch in non-PLANNING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.recordBranch('feature/x')
      expect(result.pass).toBe(false)
    })

    it('sets userApprovedPlan when recordPlanApproval succeeds', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.recordPlanApproval()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().userApprovedPlan).toBe(true)
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'plan-approval-recorded' })])
      )
    })

    it('fails recordPlanApproval in non-PLANNING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.recordPlanApproval()
      expect(result.pass).toBe(false)
    })

    it('calls deps.appendIssueChecklist when appendIssueChecklist succeeds', () => {
      const mockAppend = vi.fn()
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps({ appendIssueChecklist: mockAppend }))
      const result = wf.appendIssueChecklist(1, '- [ ] item')
      expect(result).toStrictEqual({ pass: true })
      expect(mockAppend).toHaveBeenCalledWith(1, '- [ ] item')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'issue-checklist-appended', issueNumber: 1 })])
      )
    })

    it('fails appendIssueChecklist in non-PLANNING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.appendIssueChecklist(1, '- [ ] item')
      expect(result.pass).toBe(false)
    })
  })

  describe('RESPAWN state', () => {
    it('transitions to DEVELOPING when iteration prepared and no active agents', () => {
      const state = stateWith({
        state: 'RESPAWN',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('DEVELOPING')
    })

    it('fails transition to DEVELOPING when no iteration prepared', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to DEVELOPING when active agents present', () => {
      const state = stateWith({
        state: 'RESPAWN',
        iterations: [DEFAULT_ITERATION],
        activeAgents: ['developer-1'],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result.pass).toBe(false)
    })

    it('pushes new iteration when assignIterationTask succeeds', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.assignIterationTask('build feature')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ task: 'build feature' })])
      )
    })

    it('fails assignIterationTask in non-RESPAWN states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.assignIterationTask('task')
      expect(result.pass).toBe(false)
    })
  })

  describe('DEVELOPING state', () => {
    it('transitions to REVIEWING when developerDone and dirty tree and headCommit matches', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, developerDone: true, developingHeadCommit: 'abc123' }],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('REVIEWING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('REVIEWING')
    })

    it('fails transition to REVIEWING when developerDone is false', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('REVIEWING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to REVIEWING when tree is clean', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, developerDone: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('REVIEWING')
      expect(result.pass).toBe(false)
    })

    it('fails transition to REVIEWING when head commit changed', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, developerDone: true, developingHeadCommit: 'old-commit' }],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('REVIEWING')
      expect(result.pass).toBe(false)
    })

    it('sets iteration and resets fields on onEntry from RESPAWN', () => {
      const state = stateWith({
        state: 'RESPAWN',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('DEVELOPING')
      const s = wf.getState()
      expect(s.iteration).toBe(0)
      expect(s.iterations[0]?.developingHeadCommit).toBe('abc123')
    })

    it('uses iterations.length - 1 on onEntry from RESPAWN with multiple iterations', () => {
      const state = stateWith({
        state: 'RESPAWN',
        iteration: 0,
        iterations: [
          { ...DEFAULT_ITERATION, task: 'first' },
          { ...DEFAULT_ITERATION, task: 'second' },
        ],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('DEVELOPING')
      expect(wf.getState().iteration).toBe(1)
    })

    it('uses current iteration index on onEntry from REVIEWING', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iteration: 0,
        iterations: [{ ...DEFAULT_ITERATION, reviewRejected: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('DEVELOPING')
      const s = wf.getState()
      expect(s.iteration).toBe(0)
      expect(s.iterations[0]?.developerDone).toBe(false)
    })

    it('sets developerDone when signalDone succeeds', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.signalDone()
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().iterations[0]?.developerDone).toBe(true)
    })

    it('fails signalDone in non-DEVELOPING states', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.signalDone()
      expect(result.pass).toBe(false)
    })

    it('throws when signalDone has no iteration entry', () => {
      const state = stateWith({ state: 'DEVELOPING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.signalDone()).toThrow('No iteration entry at index 0')
    })
  })
})

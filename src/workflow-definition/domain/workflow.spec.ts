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

    it('sets githubIssue and adds eventLog entry when recordIssue succeeds', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.recordIssue(42)
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().githubIssue).toBe(42)
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'record-issue', detail: { issueNumber: 42 } })])
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
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'record-branch', detail: { branch: 'feature/x' } })])
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
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'record-plan-approval' })])
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
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'append-issue-checklist', detail: { issueNumber: 1 } })])
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

  describe('REVIEWING state', () => {
    it('transitions to COMMITTING when reviewApproved', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iterations: [{ ...DEFAULT_ITERATION, reviewApproved: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMMITTING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('COMMITTING')
    })

    it('fails transition to COMMITTING when not approved', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMMITTING')
      expect(result.pass).toBe(false)
    })

    it('transitions to DEVELOPING when reviewRejected', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iterations: [{ ...DEFAULT_ITERATION, reviewRejected: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition to DEVELOPING when not rejected', () => {
      const state = stateWith({
        state: 'REVIEWING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result.pass).toBe(false)
    })

    it('sets reviewApproved when reviewApproved succeeds', () => {
      const state = stateWith({
        state: 'REVIEWING',
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
      const state = stateWith({ state: 'REVIEWING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.reviewApproved()).toThrow('No iteration at index 0')
    })

    it('sets reviewRejected when reviewRejected succeeds', () => {
      const state = stateWith({
        state: 'REVIEWING',
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
      const state = stateWith({ state: 'REVIEWING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.reviewRejected()).toThrow('No iteration at index 0')
    })
  })

  describe('COMMITTING state', () => {
    it('transitions to RESPAWN when clean tree and linted and has commits', () => {
      const state = stateWith({
        state: 'COMMITTING',
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
        state: 'COMMITTING',
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
        state: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('fails transition when lint not run', () => {
      const state = stateWith({
        state: 'COMMITTING',
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
        state: 'COMMITTING',
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
        state: 'COMMITTING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result.pass).toBe(false)
    })

    it('succeeds transition with no TS files even without lint', () => {
      const state = stateWith({
        state: 'COMMITTING',
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
        state: 'COMMITTING',
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

  describe('CR_REVIEW state', () => {
    it('transitions to PR_CREATION when feedback addressed and has commits', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackAddressed: true }],
      })
      const gitWithCommits: GitInfo = { ...cleanGit, hasCommitsVsDefault: true }
      const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => gitWithCommits }))
      const result = wf.transitionTo('PR_CREATION')
      expect(result).toStrictEqual({ pass: true })
    })

    it('transitions to PR_CREATION when feedback ignored', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackIgnored: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition when neither addressed nor ignored', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result.pass).toBe(false)
    })

    it('fails transition when addressed but no commits', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
        iterations: [{ ...DEFAULT_ITERATION, coderabbitFeedbackAddressed: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PR_CREATION')
      expect(result.pass).toBe(false)
    })

    it('sets coderabbitFeedbackAddressed when succeeds', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
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
      const state = stateWith({ state: 'CR_REVIEW' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.coderabbitFeedbackAddressed()).toThrow('No iteration at index 0')
    })

    it('sets coderabbitFeedbackIgnored when succeeds', () => {
      const state = stateWith({
        state: 'CR_REVIEW',
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
      const state = stateWith({ state: 'CR_REVIEW' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(() => wf.coderabbitFeedbackIgnored()).toThrow('No iteration at index 0')
    })
  })

  describe('PR_CREATION state', () => {
    it('transitions to FEEDBACK when prNumber set and PR checks pass', () => {
      const state = stateWith({
        state: 'PR_CREATION',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('FEEDBACK')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('FEEDBACK')
    })

    it('fails transition when no prNumber', () => {
      const state = stateWith({ state: 'PR_CREATION' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('FEEDBACK')
      expect(result.pass).toBe(false)
    })

    it('fails transition when PR checks fail', () => {
      const state = stateWith({
        state: 'PR_CREATION',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps({ checkPrChecks: () => false }))
      const result = wf.transitionTo('FEEDBACK')
      expect(result.pass).toBe(false)
    })

    it('sets prNumber when recordPr succeeds', () => {
      const state = stateWith({ state: 'PR_CREATION' })
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
      const state = stateWith({ state: 'PR_CREATION' })
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
        state: 'FEEDBACK',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMPLETE')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('COMPLETE')
    })

    it('fails transition to COMPLETE when no prNumber', () => {
      const state = stateWith({ state: 'FEEDBACK' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('COMPLETE')
      expect(result.pass).toBe(false)
    })

    it('fails transition to COMPLETE when PR checks fail', () => {
      const state = stateWith({
        state: 'FEEDBACK',
        prNumber: 42,
      })
      const wf = Workflow.rehydrate(state, makeDeps({ checkPrChecks: () => false }))
      const result = wf.transitionTo('COMPLETE')
      expect(result.pass).toBe(false)
    })

    it('transitions to RESPAWN always', () => {
      const state = stateWith({ state: 'FEEDBACK' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('RESPAWN')
      expect(result).toStrictEqual({ pass: true })
    })
  })

  describe('BLOCKED state', () => {
    it('allows transition TO BLOCKED from any state and records prior state in event log', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('BLOCKED')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('BLOCKED')
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'transition', detail: { from: 'DEVELOPING', to: 'BLOCKED' } })])
      )
    })

    it('allows transition FROM BLOCKED back to pre-blocked state', () => {
      const state = stateWith({
        state: 'BLOCKED',
        iterations: [DEFAULT_ITERATION],
        eventLog: [{ op: 'transition', at: '2026-01-01T00:00:00Z', detail: { from: 'DEVELOPING', to: 'BLOCKED' } }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('DEVELOPING')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().state).toBe('DEVELOPING')
    })

    it('fails transition FROM BLOCKED to wrong state', () => {
      const state = stateWith({
        state: 'BLOCKED',
        eventLog: [{ op: 'transition', at: '2026-01-01T00:00:00Z', detail: { from: 'DEVELOPING', to: 'BLOCKED' } }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
    })

    it('includes unknown in error when not set', () => {
      const state = stateWith({ state: 'BLOCKED' })
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
      const state = stateWith({ state: 'COMPLETE' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.transitionTo('SPAWN')
      expect(result.pass).toBe(false)
    })
  })

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

  describe('event log', () => {
    it('appends event for transition', () => {
      const state = stateWith({
        state: 'PLANNING',
        userApprovedPlan: true,
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('RESPAWN')
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'transition', detail: { from: 'PLANNING', to: 'RESPAWN' } })])
      )
    })

    it('appends event for BLOCKED transition', () => {
      const state = stateWith({ state: 'PLANNING' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('BLOCKED')
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'transition', detail: { from: 'PLANNING', to: 'BLOCKED' } })])
      )
    })

    it('appends event for unblock transition', () => {
      const state = stateWith({
        state: 'BLOCKED',
        eventLog: [{ op: 'transition', at: '2026-01-01T00:00:00Z', detail: { from: 'PLANNING', to: 'BLOCKED' } }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.transitionTo('PLANNING')
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'transition', detail: { from: 'BLOCKED', to: 'PLANNING' } })])
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

  describe('checkWriteAllowed', () => {
    it('allows writes in non-RESPAWN states', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkWriteAllowed('Write', '/some/file.ts')).toStrictEqual({ pass: true })
    })

    it('blocks Write tool in RESPAWN with generic message', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkWriteAllowed('Write', '/some/file.ts')
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Write operation 'Write' is forbidden in state: RESPAWN")
      }
    })

    it('blocks Edit tool in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkWriteAllowed('Edit', '/some/file.ts').pass).toBe(false)
    })

    it('blocks NotebookEdit tool in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkWriteAllowed('NotebookEdit', '/some/file.ts').pass).toBe(false)
    })

    it('allows non-write tools in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkWriteAllowed('Read', '/some/file.ts')).toStrictEqual({ pass: true })
    })

    it('allows state file writes in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkWriteAllowed('Write', '/tmp/feature-team-state-abc.json')).toStrictEqual({ pass: true })
    })
  })

  describe('checkBashAllowed', () => {
    it('allows non-Bash tools', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkBashAllowed('Write', 'git commit')).toStrictEqual({ pass: true })
    })

    it('allows non-git commands in DEVELOPING', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkBashAllowed('Bash', 'npm test')).toStrictEqual({ pass: true })
    })

    it('blocks git commit in DEVELOPING', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkBashAllowed('Bash', 'git commit -m "test"')
      expect(result.pass).toBe(false)
    })

    it('blocks git push in REVIEWING', () => {
      const state = stateWith({ state: 'REVIEWING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkBashAllowed('Bash', 'git push origin main')
      expect(result.pass).toBe(false)
    })

    it('blocks git commit in RESPAWN with write-block message', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkBashAllowed('Bash', 'git commit -m "test"')
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('RESPAWN')
      }
    })

    it('allows git commit in COMMITTING (exempt via allowForbidden)', () => {
      const state = stateWith({ state: 'COMMITTING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkBashAllowed('Bash', 'git commit -m "test"')).toStrictEqual({ pass: true })
    })

    it('allows git push in COMMITTING (exempt via allowForbidden)', () => {
      const state = stateWith({ state: 'COMMITTING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkBashAllowed('Bash', 'git push origin main')).toStrictEqual({ pass: true })
    })

    it('allows git commit in SPAWN', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      expect(wf.checkBashAllowed('Bash', 'git commit -m "test"')).toStrictEqual({ pass: true })
    })

    it('blocks git checkout in DEVELOPING', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkBashAllowed('Bash', 'git checkout main')
      expect(result.pass).toBe(false)
    })
  })

  describe('checkPluginSourceRead', () => {
    it('blocks Read on plugin source path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/src/bar.ts', '')
      expect(result.pass).toBe(false)
    })

    it('allows Read on non-plugin path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      expect(wf.checkPluginSourceRead('Read', '/home/project/src/bar.ts', '')).toStrictEqual({ pass: true })
    })

    it('allows Read on agent .md files within plugin cache', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      expect(wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/plugin/agents/developer.md', '')).toStrictEqual({ pass: true })
    })

    it('blocks Bash cat on plugin source', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.checkPluginSourceRead('Bash', '', 'cat /home/.claude/plugins/cache/foo/src/bar.ts')
      expect(result.pass).toBe(false)
    })

    it('allows Bash cat on non-plugin path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      expect(wf.checkPluginSourceRead('Bash', '', 'cat /home/project/src/bar.ts')).toStrictEqual({ pass: true })
    })

    it('blocks Grep on plugin source path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.checkPluginSourceRead('Grep', '/home/.claude/plugins/cache/foo/src/', '')
      expect(result.pass).toBe(false)
    })

    it('blocks Glob on plugin source path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.checkPluginSourceRead('Glob', '/home/.claude/plugins/cache/foo/src/', '')
      expect(result.pass).toBe(false)
    })

    it('allows Bash non-read commands on plugin source path', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      expect(wf.checkPluginSourceRead('Bash', '', 'rm /home/.claude/plugins/cache/foo/src/bar.ts')).toStrictEqual({ pass: true })
    })
  })

  describe('checkIdleAllowed', () => {
    it('allows lead idle in BLOCKED', () => {
      const state = stateWith({ state: 'BLOCKED' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkIdleAllowed('lead-1')).toStrictEqual({ pass: true })
    })

    it('allows lead idle in COMPLETE', () => {
      const state = stateWith({ state: 'COMPLETE' })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkIdleAllowed('lead-1')).toStrictEqual({ pass: true })
    })

    it('blocks lead idle in DEVELOPING', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkIdleAllowed('lead-1')
      expect(result.pass).toBe(false)
    })

    it('allows developer idle when developerDone', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, developerDone: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkIdleAllowed('developer-1')).toStrictEqual({ pass: true })
    })

    it('blocks developer idle when not done', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.checkIdleAllowed('developer-1')
      expect(result.pass).toBe(false)
    })

    it('allows developer idle in non-DEVELOPING states', () => {
      const state = stateWith({ state: 'REVIEWING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkIdleAllowed('developer-1')).toStrictEqual({ pass: true })
    })

    it('allows unknown agent idle', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      expect(wf.checkIdleAllowed('reviewer-1')).toStrictEqual({ pass: true })
    })
  })

  describe('shutDown', () => {
    it('removes agent from activeAgents', () => {
      const state = stateWith({ activeAgents: ['developer-1', 'reviewer-1'] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.shutDown('developer-1')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().activeAgents).toStrictEqual(['reviewer-1'])
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'shut-down', detail: { agent: 'developer-1' } })])
      )
    })

    it('handles unknown agent gracefully', () => {
      const state = stateWith({ activeAgents: ['developer-1'] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.shutDown('unknown-1')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().activeAgents).toStrictEqual(['developer-1'])
    })
  })

  describe('registerAgent', () => {
    it('adds agent to activeAgents', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      const result = wf.registerAgent('developer-1', 'agent-abc')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().activeAgents).toStrictEqual(['developer-1'])
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'subagent-start', detail: { agent: 'developer-1', agentId: 'agent-abc' } })])
      )
    })

    it('does not duplicate agent', () => {
      const state = stateWith({ activeAgents: ['developer-1'] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.registerAgent('developer-1', 'agent-xyz')
      expect(wf.getState().activeAgents).toStrictEqual(['developer-1'])
      expect(wf.getState().eventLog).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ op: 'subagent-start', detail: { agent: 'developer-1', agentId: 'agent-xyz' } })])
      )
    })
  })
})

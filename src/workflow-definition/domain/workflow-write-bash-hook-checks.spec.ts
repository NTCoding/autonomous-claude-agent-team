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

    it('appends write-checked event with allowed=true when no write restriction', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkWriteAllowed('Write', '/some/file.ts')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'write-checked', tool: 'Write', filePath: '/some/file.ts', allowed: true })
    })

    it('appends write-checked event with allowed=true for non-write tool in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkWriteAllowed('Read', '/some/file.ts')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'write-checked', tool: 'Read', filePath: '/some/file.ts', allowed: true })
    })

    it('appends write-checked event with allowed=true for state file in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkWriteAllowed('Write', '/tmp/feature-team-state-abc.json')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'write-checked', tool: 'Write', filePath: '/tmp/feature-team-state-abc.json', allowed: true })
    })

    it('appends write-checked event with allowed=false and reason when blocked', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkWriteAllowed('Write', '/some/file.ts')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'write-checked',
        tool: 'Write',
        filePath: '/some/file.ts',
        allowed: false,
        reason: "Write operation 'Write' is forbidden in state: RESPAWN",
      })
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

    it('appends bash-checked event with allowed=true for non-Bash tool', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkBashAllowed('Write', 'git commit')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'bash-checked', tool: 'Write', command: 'git commit', allowed: true })
    })

    it('appends bash-checked event with allowed=true for allowed Bash command', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkBashAllowed('Bash', 'npm test')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'bash-checked', tool: 'Bash', command: 'npm test', allowed: true })
    })

    it('appends bash-checked event with allowed=false and reason when git commit blocked in DEVELOPING', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkBashAllowed('Bash', 'git commit -m "test"')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'bash-checked',
        tool: 'Bash',
        command: 'git commit -m "test"',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends bash-checked event with allowed=false and reason when git commit blocked in RESPAWN', () => {
      const state = stateWith({ state: 'RESPAWN' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkBashAllowed('Bash', 'git commit -m "test"')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'bash-checked',
        tool: 'Bash',
        command: 'git commit -m "test"',
        allowed: false,
        reason: expect.stringContaining('RESPAWN'),
      })
    })

    it('appends bash-checked event with allowed=true for exempt git commit in COMMITTING', () => {
      const state = stateWith({ state: 'COMMITTING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkBashAllowed('Bash', 'git commit -m "test"')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'bash-checked', tool: 'Bash', command: 'git commit -m "test"', allowed: true })
    })
  })
})

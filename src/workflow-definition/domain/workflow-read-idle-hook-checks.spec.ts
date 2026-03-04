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

    it('appends plugin-read-checked event with allowed=false and reason when Read blocked', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/src/bar.ts', '')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Read',
        path: '/home/.claude/plugins/cache/foo/src/bar.ts',
        allowed: false,
        reason: expect.stringContaining('not allowed'),
      })
    })

    it('appends plugin-read-checked event with allowed=false and path=command when Bash cat blocked', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      wf.checkPluginSourceRead('Bash', '', 'cat /home/.claude/plugins/cache/foo/src/bar.ts')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Bash',
        path: 'cat /home/.claude/plugins/cache/foo/src/bar.ts',
        allowed: false,
        reason: expect.stringContaining('not allowed'),
      })
    })

    it('appends plugin-read-checked event with allowed=true when read is allowed', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      wf.checkPluginSourceRead('Read', '/home/project/src/bar.ts', '')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Read',
        path: '/home/project/src/bar.ts',
        allowed: true,
      })
    })

    it('appends plugin-read-checked event with allowed=true using command as path when filePath is empty', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE }, makeDeps())
      wf.checkPluginSourceRead('Bash', '', 'cat /home/project/src/bar.ts')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Bash',
        path: 'cat /home/project/src/bar.ts',
        allowed: true,
      })
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

    it('appends idle-checked event with allowed=true when lead idle is allowed', () => {
      const state = stateWith({ state: 'BLOCKED' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('lead-1')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'idle-checked', agentName: 'lead-1', allowed: true })
    })

    it('appends idle-checked event with allowed=false and reason when lead idle is blocked', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('lead-1')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'idle-checked',
        agentName: 'lead-1',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends idle-checked event with allowed=true when developer idle is allowed', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [{ ...DEFAULT_ITERATION, developerDone: true }],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('developer-1')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'idle-checked', agentName: 'developer-1', allowed: true })
    })

    it('appends idle-checked event with allowed=false and reason when developer idle is blocked', () => {
      const state = stateWith({
        state: 'DEVELOPING',
        iterations: [DEFAULT_ITERATION],
      })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('developer-1')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({
        type: 'idle-checked',
        agentName: 'developer-1',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends idle-checked event with allowed=true for unknown agent', () => {
      const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('reviewer-1')
      expect(wf.getPendingEvents()).toHaveLength(1)
      expect(wf.getPendingEvents()[0]).toMatchObject({ type: 'idle-checked', agentName: 'reviewer-1', allowed: true })
    })

    it('does not include reason in idle-checked event when allowed', () => {
      const state = stateWith({ state: 'BLOCKED' })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.checkIdleAllowed('lead-1')
      const event = wf.getPendingEvents()[0]
      expect(event).toMatchObject({ type: 'idle-checked', allowed: true })
      expect(event).not.toMatchObject({ reason: expect.anything() })
    })
  })
})

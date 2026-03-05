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
  describe('shutDown', () => {
    it('removes agent from activeAgents', () => {
      const state = stateWith({ activeAgents: ['developer-1', 'reviewer-1'] })
      const wf = Workflow.rehydrate(state, makeDeps())
      const result = wf.shutDown('developer-1')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getState().activeAgents).toStrictEqual(['reviewer-1'])
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-shut-down', agentName: 'developer-1' })])
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
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-registered', agentType: 'developer-1', agentId: 'agent-abc' })])
      )
    })

    it('does not duplicate agent', () => {
      const state = stateWith({ activeAgents: ['developer-1'] })
      const wf = Workflow.rehydrate(state, makeDeps())
      wf.registerAgent('developer-1', 'agent-xyz')
      expect(wf.getState().activeAgents).toStrictEqual(['developer-1'])
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-registered', agentType: 'developer-1', agentId: 'agent-xyz' })])
      )
    })
  })

  describe('verifyIdentity', () => {
    it('returns pass and emits identity-verified event when no messages yet', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
      const result = wf.verifyIdentity('/path/to/transcript.jsonl')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'identity-verified', status: 'never-spoken', transcriptPath: '/path/to/transcript.jsonl' }),
        ])
      )
    })

    it('returns pass when last message starts with lead prefix', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps({
        readTranscriptMessages: () => [
          { id: 'msg-1', hasTextContent: true, startsWithLeadPrefix: true },
        ],
      }))
      const result = wf.verifyIdentity('/t.jsonl')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'identity-verified', status: 'verified' })])
      )
    })

    it('returns fail with recovery message when identity is lost', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps({
        readTranscriptMessages: () => [
          { id: 'msg-1', hasTextContent: true, startsWithLeadPrefix: true },
          { id: 'msg-2', hasTextContent: true, startsWithLeadPrefix: false },
        ],
      }))
      const result = wf.verifyIdentity('/t.jsonl')
      expect(result.pass).toBe(false)
      expect(result.pass ? '' : result.reason).toContain('lost your feature-team-lead identity')
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'identity-verified', status: 'lost' })])
      )
    })
  })

  describe('writeJournal', () => {
    it('appends journal-entry event with agent name and content', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
      const result = wf.writeJournal('developer-1', 'Completed auth module')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'journal-entry', agentName: 'developer-1', content: 'Completed auth module' }),
        ])
      )
    })

    it('returns fail when content is empty', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
      const result = wf.writeJournal('developer-1', '')
      expect(result.pass).toBe(false)
    })
  })

  describe('requestContext', () => {
    it('appends context-requested event and returns pass', () => {
      const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
      const result = wf.requestContext('developer-1')
      expect(result).toStrictEqual({ pass: true })
      expect(wf.getPendingEvents()).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'context-requested', agentName: 'developer-1' })])
      )
    })
  })
})

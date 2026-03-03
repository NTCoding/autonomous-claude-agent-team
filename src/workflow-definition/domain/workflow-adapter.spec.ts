import { WorkflowAdapter } from './workflow-adapter.js'
import type { WorkflowRuntimeDeps } from '../../workflow-engine/index.js'
import type { BaseEvent } from '../../workflow-engine/index.js'

function makeWorkflowDeps(): WorkflowRuntimeDeps {
  return {
    getGitInfo: () => ({
      currentBranch: 'main',
      workingTreeClean: true,
      headCommit: 'abc123',
      changedFilesVsDefault: [],
      hasCommitsVsDefault: false,
    }),
    checkPrChecks: () => true,
    createDraftPr: () => 99,
    appendIssueChecklist: () => undefined,
    tickFirstUncheckedIteration: () => undefined,
    runEslintOnFiles: () => true,
    fileExists: () => false,
    getPluginRoot: () => '/plugin',
    now: () => '2026-01-01T00:00:00.000Z',
    readTranscriptMessages: () => [],
  }
}

describe('WorkflowAdapter', () => {
  it('rehydrates a Workflow from events and deps', () => {
    const events: readonly BaseEvent[] = []
    const workflow = WorkflowAdapter.rehydrate(events, makeWorkflowDeps())
    expect(workflow.getState().state).toStrictEqual('SPAWN')
  })

  it('throws WorkflowStateError on unknown event types', () => {
    const events: readonly BaseEvent[] = [
      { type: 'unknown-event', at: '2026-01-01T00:00:00.000Z' },
    ]
    expect(() => WorkflowAdapter.rehydrate(events, makeWorkflowDeps())).toThrow('Unknown event type in store')
  })

  it('returns procedure path for a given state', () => {
    const path = WorkflowAdapter.procedurePath('SPAWN', '/plugin')
    expect(path).toContain('spawn')
    expect(path).toContain('/plugin/')
  })

  it('returns emoji for known state', () => {
    const emoji = WorkflowAdapter.getEmojiForState('SPAWN')
    expect(typeof emoji).toStrictEqual('string')
  })

  it('returns empty string for unknown state', () => {
    const emoji = WorkflowAdapter.getEmojiForState('UNKNOWN_STATE')
    expect(emoji).toStrictEqual('')
  })
})

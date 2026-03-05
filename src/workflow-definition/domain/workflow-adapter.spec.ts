import { WorkflowAdapter } from './workflow-adapter.js'
import type { WorkflowDeps } from '../../workflow-definition/domain/workflow.js'
import type { BaseEvent } from '@ntcoding/agentic-workflow-builder/engine'

function makeWorkflowDeps(): WorkflowDeps {
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
  it('creates a fresh Workflow with SPAWN state', () => {
    const workflow = WorkflowAdapter.createFresh(makeWorkflowDeps())
    expect(workflow.getState().currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('rehydrates a Workflow from events and deps', () => {
    const events: readonly BaseEvent[] = []
    const workflow = WorkflowAdapter.rehydrate(events, makeWorkflowDeps())
    expect(workflow.getState().currentStateMachineState).toStrictEqual('SPAWN')
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

  it('throws on unknown state', () => {
    expect(() => WorkflowAdapter.getEmojiForState('UNKNOWN_STATE')).toThrow('invalid_enum_value')
  })

  it('returns initial state with SPAWN', () => {
    const initial = WorkflowAdapter.initialState()
    expect(initial.currentStateMachineState).toStrictEqual('SPAWN')
  })
})

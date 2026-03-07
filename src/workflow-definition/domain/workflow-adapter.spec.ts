import { WorkflowAdapter } from './workflow-adapter.js'
import type { WorkflowDeps } from '../../workflow-definition/domain/workflow.js'
import type { WorkflowState } from './workflow-types.js'
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

  it('returns initial state with SPAWN', () => {
    const initial = WorkflowAdapter.initialState()
    expect(initial.currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('returns workflow registry', () => {
    const registry = WorkflowAdapter.getRegistry()
    expect(registry['SPAWN']).toBeDefined()
    expect(registry['SPAWN']?.emoji).toStrictEqual('🟣')
  })

  it('builds transition context with git info and PR checks from deps', () => {
    const deps = makeWorkflowDeps()
    const state = WorkflowAdapter.initialState()
    const ctx = WorkflowAdapter.buildTransitionContext(state, 'SPAWN', 'PLANNING', deps)
    expect(ctx).toMatchObject({ state, from: 'SPAWN', to: 'PLANNING', prChecksPass: false })
    expect(ctx.gitInfo.currentBranch).toStrictEqual('main')
  })

  it('builds transition context with prChecksPass true when PR exists', () => {
    const deps = makeWorkflowDeps()
    const state = { ...WorkflowAdapter.initialState(), prNumber: 42 }
    const ctx = WorkflowAdapter.buildTransitionContext(state, 'PR_CREATION', 'FEEDBACK', deps)
    expect(ctx.prChecksPass).toStrictEqual(true)
  })

  it('builds transition event with from/to', () => {
    const stateBefore = WorkflowAdapter.initialState()
    const stateAfter: WorkflowState = { ...stateBefore, currentStateMachineState: 'PLANNING' as const }
    const event = WorkflowAdapter.buildTransitionEvent?.('SPAWN', 'PLANNING', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ type: 'transitioned', from: 'SPAWN', to: 'PLANNING' })
  })

  it('builds transition event with iteration when changed', () => {
    const stateBefore = { ...WorkflowAdapter.initialState(), iteration: 0 }
    const stateAfter = { ...stateBefore, iteration: 1 }
    const event = WorkflowAdapter.buildTransitionEvent?.('COMMITTING', 'RESPAWN', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ iteration: 1 })
  })

  it('builds transition event with developingHeadCommit for DEVELOPING', () => {
    const stateBefore = { ...WorkflowAdapter.initialState(), iteration: 0, iterations: [{ task: 't', developerDone: false, developingHeadCommit: 'abc123', reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }] }
    const stateAfter = { ...stateBefore }
    const event = WorkflowAdapter.buildTransitionEvent?.('RESPAWN', 'DEVELOPING', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ developingHeadCommit: 'abc123' })
  })

  it('returns prefix config with LEAD pattern', () => {
    const config = WorkflowAdapter.getPrefixConfig?.()
    expect(config).toBeDefined()
    expect(config?.pattern.test('LEAD: SPAWN')).toBe(true)
    expect(config?.pattern.test('no prefix')).toBe(false)
  })

  it('builds recovery message with state and emoji', () => {
    const config = WorkflowAdapter.getPrefixConfig?.()
    const msg = config?.buildRecoveryMessage('DEVELOPING', '🔨', '/plugin')
    expect(msg).toContain('lost your feature-team-lead identity')
    expect(msg).toContain('DEVELOPING')
    expect(msg).toContain('🔨 LEAD: DEVELOPING')
    expect(msg).toContain('states/developing.md')
  })
})

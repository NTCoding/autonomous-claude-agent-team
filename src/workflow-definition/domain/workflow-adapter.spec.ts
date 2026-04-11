import { FeatureTeamWorkflowDefinition } from './workflow-adapter.js'
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

describe('FeatureTeamWorkflowDefinition', () => {
  it('initialState returns SPAWN state', () => {
    const initial = FeatureTeamWorkflowDefinition.initialState()
    expect(initial.currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('buildWorkflow creates Workflow from state and deps', () => {
    const state = FeatureTeamWorkflowDefinition.initialState()
    const workflow = FeatureTeamWorkflowDefinition.buildWorkflow(state, makeWorkflowDeps())
    expect(workflow.getState().currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('fold applies known events to state', () => {
    const initial = FeatureTeamWorkflowDefinition.initialState()
    const event: BaseEvent = { type: 'session-started', at: '2026-01-01T00:00:00.000Z' }
    const result = FeatureTeamWorkflowDefinition.fold(initial, event)
    expect(result.currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('fold throws WorkflowStateError on unknown event types', () => {
    const initial = FeatureTeamWorkflowDefinition.initialState()
    const unknownEvent: BaseEvent = { type: 'unknown-event', at: '2026-01-01T00:00:00.000Z' }
    expect(() => FeatureTeamWorkflowDefinition.fold(initial, unknownEvent)).toThrow('Unknown event type in store')
  })

  it('stateSchema parses valid state names', () => {
    const result = FeatureTeamWorkflowDefinition.stateSchema.parse('SPAWN')
    expect(result).toStrictEqual('SPAWN')
  })

  it('stateSchema rejects invalid state names', () => {
    expect(() => FeatureTeamWorkflowDefinition.stateSchema.parse('INVALID')).toThrow('Invalid enum value')
  })

  it('returns workflow registry', () => {
    const registry = FeatureTeamWorkflowDefinition.getRegistry()
    expect(registry['SPAWN']).toBeDefined()
    expect(registry['SPAWN']?.emoji).toStrictEqual('🟣')
  })

  it('builds transition context with git info and PR checks from deps', () => {
    const deps = makeWorkflowDeps()
    const state = FeatureTeamWorkflowDefinition.initialState()
    const ctx = FeatureTeamWorkflowDefinition.buildTransitionContext(state, 'SPAWN', 'PLANNING', deps)
    expect(ctx).toMatchObject({ state, from: 'SPAWN', to: 'PLANNING' })
    expect(Reflect.get(ctx, 'prChecksPass')).toStrictEqual(false)
    expect(ctx.gitInfo.currentBranch).toStrictEqual('main')
  })

  it('builds transition context with prChecksPass true when PR exists', () => {
    const deps = makeWorkflowDeps()
    const state = { ...FeatureTeamWorkflowDefinition.initialState(), prNumber: 42 }
    const ctx = FeatureTeamWorkflowDefinition.buildTransitionContext(state, 'PR_CREATION', 'FEEDBACK', deps)
    expect(Reflect.get(ctx, 'prChecksPass')).toStrictEqual(true)
  })

  it('builds transition event with from/to', () => {
    const stateBefore = FeatureTeamWorkflowDefinition.initialState()
    const stateAfter: WorkflowState = { ...stateBefore, currentStateMachineState: 'PLANNING' as const }
    const event = FeatureTeamWorkflowDefinition.buildTransitionEvent?.('SPAWN', 'PLANNING', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ type: 'transitioned', from: 'SPAWN', to: 'PLANNING' })
  })

  it('builds transition event with iteration when changed', () => {
    const stateBefore = { ...FeatureTeamWorkflowDefinition.initialState(), iteration: 0 }
    const stateAfter = { ...stateBefore, iteration: 1 }
    const event = FeatureTeamWorkflowDefinition.buildTransitionEvent?.('COMMITTING', 'RESPAWN', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ iteration: 1 })
  })

  it('builds transition event with developingHeadCommit for DEVELOPING', () => {
    const stateBefore = { ...FeatureTeamWorkflowDefinition.initialState(), iteration: 0, iterations: [{ task: 't', developerDone: false, developingHeadCommit: 'abc123', reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }] }
    const stateAfter = { ...stateBefore }
    const event = FeatureTeamWorkflowDefinition.buildTransitionEvent?.('RESPAWN', 'DEVELOPING', stateBefore, stateAfter, '2026-01-01T00:00:00Z')
    expect(event).toMatchObject({ developingHeadCommit: 'abc123' })
  })
})

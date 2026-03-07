import { Workflow } from '../index.js'
import type { WorkflowEvent } from './workflow-events.js'
import {
  spec,
  makeDeps,
  cleanGit,
  dirtyGit,
  issueRecorded,
  agentRegistered,
  agentShutDown,
  transitioned,
  transitionTo,
  branchRecorded,
  planApprovalRecorded,
  iterationTaskAssigned,
  developerDoneSignaled,
  reviewRejected,
  eventsToPlanning,
  eventsToRespawn,
  eventsToDeveloping,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('createFresh', () => {
    it('creates a workflow in SPAWN state with empty pending events', () => {
      const wf = Workflow.createFresh(makeDeps())
      expect(wf.getState().currentStateMachineState).toBe('SPAWN')
      expect(wf.getPendingEvents()).toHaveLength(0)
    })
  })

  describe('startSession', () => {
    it('appends session-started event with transcriptPath', () => {
      const { events } = spec.given().when((wf) => wf.startSession('/tmp/transcript.jsonl', undefined))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'session-started', transcriptPath: '/tmp/transcript.jsonl' })
    })

    it('appends session-started event without transcriptPath when undefined', () => {
      const { events } = spec.given().when((wf) => wf.startSession(undefined, undefined))
      expect(events).toHaveLength(1)
      expect(events[0]).not.toHaveProperty('transcriptPath')
    })

    it('appends session-started event with repository when provided', () => {
      const { events } = spec.given().when((wf) => wf.startSession(undefined, 'owner/repo'))
      expect(events[0]).toMatchObject({ type: 'session-started', repository: 'owner/repo' })
    })

    it('omits repository from event when undefined', () => {
      const { events } = spec.given().when((wf) => wf.startSession(undefined, undefined))
      expect(events[0]).not.toHaveProperty('repository')
    })
  })

  describe('getAgentInstructions', () => {
    it('returns path from registry agentInstructions field', () => {
      const { result } = spec.given().when((wf) => wf.getAgentInstructions('/plugin'))
      expect(result).toBe('/plugin/states/spawn.md')
    })
  })

  describe('SPAWN state', () => {
    it('transitions to PLANNING when issue set and developer and reviewer agents present', () => {
      const { result, state } = spec
        .given(issueRecorded(1), agentRegistered('developer-1'), agentRegistered('reviewer-1'))
        .when((wf) => transitionTo(wf,'PLANNING'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('PLANNING')
    })

    it('fails transition to PLANNING when no githubIssue', () => {
      const { result } = spec
        .given(agentRegistered('developer-1'), agentRegistered('reviewer-1'))
        .when((wf) => transitionTo(wf,'PLANNING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to PLANNING when no developer agent', () => {
      const { result } = spec
        .given(issueRecorded(1), agentRegistered('reviewer-1'))
        .when((wf) => transitionTo(wf,'PLANNING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to PLANNING when no reviewer agent', () => {
      const { result } = spec
        .given(issueRecorded(1), agentRegistered('developer-1'))
        .when((wf) => transitionTo(wf,'PLANNING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to non-PLANNING states', () => {
      const { result } = spec
        .given(issueRecorded(1), agentRegistered('developer-1'), agentRegistered('reviewer-1'))
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result.pass).toBe(false)
    })

    it('sets githubIssue and emits event when recordIssue succeeds', () => {
      const { result, state, events } = spec.given().when((wf) => wf.recordIssue(42))
      expect(result).toStrictEqual({ pass: true })
      expect(state.githubIssue).toBe(42)
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'issue-recorded', issueNumber: 42 })])
      )
    })

    it('fails recordIssue in non-SPAWN states', () => {
      const { result } = spec
        .given(...eventsToPlanning())
        .when((wf) => wf.recordIssue(42))
      expect(result.pass).toBe(false)
    })
  })

  describe('PLANNING state', () => {
    it('transitions to RESPAWN when plan approved and clean tree', () => {
      const { result, state } = spec
        .given(...eventsToPlanning(), planApprovalRecorded())
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('RESPAWN')
    })

    it('fails transition to RESPAWN when plan not approved', () => {
      const { result } = spec
        .given(...eventsToPlanning())
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to RESPAWN when dirty tree', () => {
      const { result } = spec
        .given(...eventsToPlanning(), planApprovalRecorded())
        .withDeps({ getGitInfo: () => dirtyGit })
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('sets featureBranch when recordBranch succeeds', () => {
      const { result, state, events } = spec
        .given(...eventsToPlanning())
        .when((wf) => wf.recordBranch('feature/x'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.featureBranch).toBe('feature/x')
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'branch-recorded', branch: 'feature/x' })])
      )
    })

    it('fails recordBranch in non-PLANNING states', () => {
      const { result } = spec.given().when((wf) => wf.recordBranch('feature/x'))
      expect(result.pass).toBe(false)
    })

    it('sets userApprovedPlan when recordPlanApproval succeeds', () => {
      const { result, state, events } = spec
        .given(...eventsToPlanning())
        .when((wf) => wf.recordPlanApproval())
      expect(result).toStrictEqual({ pass: true })
      expect(state.userApprovedPlan).toBe(true)
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'plan-approval-recorded' })])
      )
    })

    it('fails recordPlanApproval in non-PLANNING states', () => {
      const { result } = spec.given().when((wf) => wf.recordPlanApproval())
      expect(result.pass).toBe(false)
    })

    it('calls deps.appendIssueChecklist when appendIssueChecklist succeeds', () => {
      const mockAppend = vi.fn()
      const { result, events } = spec
        .given(...eventsToPlanning())
        .withDeps({ appendIssueChecklist: mockAppend })
        .when((wf) => wf.appendIssueChecklist(1, '- [ ] item'))
      expect(result).toStrictEqual({ pass: true })
      expect(mockAppend).toHaveBeenCalledWith(1, '- [ ] item')
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'issue-checklist-appended', issueNumber: 1 })])
      )
    })

    it('fails appendIssueChecklist in non-PLANNING states', () => {
      const { result } = spec.given().when((wf) => wf.appendIssueChecklist(1, '- [ ] item'))
      expect(result.pass).toBe(false)
    })
  })

  describe('RESPAWN state', () => {
    it('transitions to DEVELOPING when iteration prepared and no active agents', () => {
      const { result, state } = spec
        .given(
          ...eventsToRespawn(),
          agentShutDown('developer-1'),
          agentShutDown('reviewer-1'),
          iterationTaskAssigned('test task'),
        )
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('DEVELOPING')
    })

    it('fails transition to DEVELOPING when no iteration prepared', () => {
      const { result } = spec
        .given(
          ...eventsToRespawn(),
          agentShutDown('developer-1'),
          agentShutDown('reviewer-1'),
        )
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to DEVELOPING when active agents present', () => {
      const { result } = spec
        .given(...eventsToRespawn(), iterationTaskAssigned('test task'))
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result.pass).toBe(false)
    })

    it('pushes new iteration when assignIterationTask succeeds', () => {
      const { result, state } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.assignIterationTask('build feature'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ task: 'build feature' })])
      )
    })

    it('fails assignIterationTask in non-RESPAWN states', () => {
      const { result } = spec.given().when((wf) => wf.assignIterationTask('task'))
      expect(result.pass).toBe(false)
    })
  })

  describe('DEVELOPING state', () => {
    it('transitions to REVIEWING when developerDone and dirty tree and headCommit matches', () => {
      const { result, state } = spec
        .given(...eventsToDeveloping(), developerDoneSignaled())
        .withDeps({ getGitInfo: () => dirtyGit })
        .when((wf) => transitionTo(wf,'REVIEWING'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('REVIEWING')
    })

    it('fails transition to REVIEWING when developerDone is false', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .withDeps({ getGitInfo: () => dirtyGit })
        .when((wf) => transitionTo(wf,'REVIEWING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to REVIEWING when tree is clean', () => {
      const { result } = spec
        .given(...eventsToDeveloping(), developerDoneSignaled())
        .when((wf) => transitionTo(wf,'REVIEWING'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to REVIEWING when head commit changed', () => {
      const { result } = spec
        .given(...eventsToDeveloping(), developerDoneSignaled())
        .withDeps({ getGitInfo: () => ({ ...dirtyGit, headCommit: 'different' }) })
        .when((wf) => transitionTo(wf,'REVIEWING'))
      expect(result.pass).toBe(false)
    })

    it('sets iteration and resets fields on onEntry from RESPAWN', () => {
      const events: readonly WorkflowEvent[] = [
        ...eventsToRespawn(),
        agentShutDown('developer-1'),
        agentShutDown('reviewer-1'),
        iterationTaskAssigned('test task'),
      ]
      const { state } = spec
        .given(...events)
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(state.iteration).toBe(0)
      expect(state.iterations[0]?.developingHeadCommit).toBe('abc123')
    })

    it('uses iterations.length - 1 on onEntry from RESPAWN with multiple iterations', () => {
      const events: readonly WorkflowEvent[] = [
        ...eventsToRespawn(),
        agentShutDown('developer-1'),
        agentShutDown('reviewer-1'),
        iterationTaskAssigned('first'),
        iterationTaskAssigned('second'),
      ]
      const { state } = spec
        .given(...events)
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(state.iteration).toBe(1)
    })

    it('uses current iteration index on onEntry from REVIEWING', () => {
      const events: readonly WorkflowEvent[] = [
        ...eventsToDeveloping(),
        developerDoneSignaled(),
        transitioned('DEVELOPING', 'REVIEWING'),
        reviewRejected(),
      ]
      const { state } = spec
        .given(...events)
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(state.iteration).toBe(0)
      expect(state.iterations[0]?.developerDone).toBe(false)
    })

    it('sets developerDone when signalDone succeeds', () => {
      const { result, state } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.signalDone())
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.developerDone).toBe(true)
    })

    it('fails signalDone in non-DEVELOPING states', () => {
      const { result } = spec.given().when((wf) => wf.signalDone())
      expect(result.pass).toBe(false)
    })

    it('throws when signalDone has no iteration entry', () => {
      const events: readonly WorkflowEvent[] = [
        ...eventsToPlanning(),
        planApprovalRecorded(),
        transitioned('PLANNING', 'RESPAWN'),
        agentShutDown('developer-1'),
        agentShutDown('reviewer-1'),
        transitioned('RESPAWN', 'DEVELOPING'),
      ]
      const { error } = spec
        .given(...events)
        .whenThrows((wf) => wf.signalDone())
      expect(error).toHaveProperty('message', 'No iteration entry at index 0')
    })
  })
})

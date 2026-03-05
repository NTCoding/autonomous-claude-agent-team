import { Workflow } from '../index.js'
import { INITIAL_STATE } from './workflow-types.js'
import type { GitInfo } from '@ntcoding/agentic-workflow-builder/dsl'
import {
  spec,
  makeDeps,
  cleanGit,
  DEFAULT_ITERATION,
  eventsToCrReview,
  eventsToPrCreation,
  eventsToFeedback,
  eventsToDeveloping,
  eventsToComplete,
  coderabbitAddressed,
  coderabbitIgnored,
  prRecorded,
  transitioned,
  iterationTaskAssigned,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('CR_REVIEW state', () => {
    it('transitions to PR_CREATION when feedback addressed and has commits', () => {
      const gitWithCommits: GitInfo = { ...cleanGit, hasCommitsVsDefault: true }
      const { result } = spec
        .given(...eventsToCrReview(), coderabbitAddressed())
        .withDeps({ getGitInfo: () => gitWithCommits })
        .when((wf) => wf.transitionTo('PR_CREATION'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('transitions to PR_CREATION when feedback ignored', () => {
      const { result } = spec
        .given(...eventsToCrReview(), coderabbitIgnored())
        .when((wf) => wf.transitionTo('PR_CREATION'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition when neither addressed nor ignored', () => {
      const { result } = spec
        .given(...eventsToCrReview())
        .when((wf) => wf.transitionTo('PR_CREATION'))
      expect(result.pass).toBe(false)
    })

    it('fails transition when addressed but no commits', () => {
      const { result } = spec
        .given(...eventsToCrReview(), coderabbitAddressed())
        .when((wf) => wf.transitionTo('PR_CREATION'))
      expect(result.pass).toBe(false)
    })

    it('sets coderabbitFeedbackAddressed when succeeds', () => {
      const { result, state } = spec
        .given(...eventsToCrReview())
        .when((wf) => wf.coderabbitFeedbackAddressed())
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.coderabbitFeedbackAddressed).toBe(true)
    })

    it('fails coderabbitFeedbackAddressed in non-CR_REVIEW states', () => {
      const { result } = spec.given().when((wf) => wf.coderabbitFeedbackAddressed())
      expect(result.pass).toBe(false)
    })

    it('throws coderabbitFeedbackAddressed when no iteration', () => {
      const { error } = spec
        .given(transitioned('SPAWN', 'CR_REVIEW'))
        .whenThrows((wf) => wf.coderabbitFeedbackAddressed())
      expect(error).toHaveProperty('message', 'No iteration at index 0')
    })

    it('sets coderabbitFeedbackIgnored when succeeds', () => {
      const { result, state } = spec
        .given(...eventsToCrReview())
        .when((wf) => wf.coderabbitFeedbackIgnored())
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.coderabbitFeedbackIgnored).toBe(true)
    })

    it('fails coderabbitFeedbackIgnored in non-CR_REVIEW states', () => {
      const { result } = spec.given().when((wf) => wf.coderabbitFeedbackIgnored())
      expect(result.pass).toBe(false)
    })

    it('throws coderabbitFeedbackIgnored when no iteration', () => {
      const { error } = spec
        .given(transitioned('SPAWN', 'CR_REVIEW'))
        .whenThrows((wf) => wf.coderabbitFeedbackIgnored())
      expect(error).toHaveProperty('message', 'No iteration at index 0')
    })
  })

  describe('PR_CREATION state', () => {
    it('transitions to FEEDBACK when prNumber set and PR checks pass', () => {
      const { result, state } = spec
        .given(...eventsToPrCreation(), prRecorded(42))
        .when((wf) => wf.transitionTo('FEEDBACK'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('FEEDBACK')
    })

    it('fails transition when no prNumber', () => {
      const { result } = spec
        .given(...eventsToPrCreation())
        .when((wf) => wf.transitionTo('FEEDBACK'))
      expect(result.pass).toBe(false)
    })

    it('fails transition when PR checks fail', () => {
      const { result } = spec
        .given(...eventsToPrCreation(), prRecorded(42))
        .withDeps({ checkPrChecks: () => false })
        .when((wf) => wf.transitionTo('FEEDBACK'))
      expect(result.pass).toBe(false)
    })

    it('sets prNumber when recordPr succeeds', () => {
      const { result, state } = spec
        .given(...eventsToPrCreation())
        .when((wf) => wf.recordPr(99))
      expect(result).toStrictEqual({ pass: true })
      expect(state.prNumber).toBe(99)
    })

    it('fails recordPr in non-PR_CREATION states', () => {
      const { result } = spec.given().when((wf) => wf.recordPr(99))
      expect(result.pass).toBe(false)
    })

    it('calls deps.createDraftPr and sets prNumber when createPr succeeds', () => {
      const mockCreate = vi.fn().mockReturnValue(77)
      const { result, state } = spec
        .given(...eventsToPrCreation())
        .withDeps({ createDraftPr: mockCreate })
        .when((wf) => wf.createPr('title', 'body'))
      expect(result).toStrictEqual({ pass: true })
      expect(mockCreate).toHaveBeenCalledWith('title', 'body')
      expect(state.prNumber).toBe(77)
    })

    it('fails createPr in non-PR_CREATION states', () => {
      const { result } = spec.given().when((wf) => wf.createPr('t', 'b'))
      expect(result.pass).toBe(false)
    })
  })

  describe('FEEDBACK state', () => {
    it('transitions to COMPLETE when prNumber set and checks pass', () => {
      const { result, state } = spec
        .given(...eventsToFeedback())
        .when((wf) => wf.transitionTo('COMPLETE'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('COMPLETE')
    })

    it('fails transition to COMPLETE when no prNumber', () => {
      const { result } = spec
        .given(
          ...eventsToPrCreation(),
          transitioned('PR_CREATION', 'FEEDBACK'),
        )
        .when((wf) => wf.transitionTo('COMPLETE'))
      expect(result.pass).toBe(false)
    })

    it('fails transition to COMPLETE when PR checks fail', () => {
      const { result } = spec
        .given(...eventsToFeedback())
        .withDeps({ checkPrChecks: () => false })
        .when((wf) => wf.transitionTo('COMPLETE'))
      expect(result.pass).toBe(false)
    })

    it('transitions to RESPAWN always', () => {
      const { result } = spec
        .given(
          ...eventsToPrCreation(),
          transitioned('PR_CREATION', 'FEEDBACK'),
        )
        .when((wf) => wf.transitionTo('RESPAWN'))
      expect(result).toStrictEqual({ pass: true })
    })
  })

  describe('BLOCKED state', () => {
    it('allows transition TO BLOCKED from any state and sets preBlockedState', () => {
      const { result, state, events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.transitionTo('BLOCKED'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('BLOCKED')
      expect(state.preBlockedState).toBe('DEVELOPING')
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'DEVELOPING', to: 'BLOCKED' })])
      )
    })

    it('allows transition FROM BLOCKED back to pre-blocked state', () => {
      const { result, state } = spec
        .given(
          ...eventsToDeveloping(),
          transitioned('DEVELOPING', 'BLOCKED'),
        )
        .when((wf) => wf.transitionTo('DEVELOPING'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('DEVELOPING')
    })

    it('fails transition FROM BLOCKED to wrong state', () => {
      const { result } = spec
        .given(
          ...eventsToDeveloping(),
          transitioned('DEVELOPING', 'BLOCKED'),
        )
        .when((wf) => wf.transitionTo('PLANNING'))
      expect(result.pass).toBe(false)
    })

    it('includes unknown in error when not set', () => {
      const wf = Workflow.rehydrate({ ...INITIAL_STATE, currentStateMachineState: 'BLOCKED' }, makeDeps())
      const result = wf.transitionTo('PLANNING')
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('unknown')
      }
    })
  })

  describe('COMPLETE state', () => {
    it('fails all transitions since canTransitionTo is empty', () => {
      const { result } = spec
        .given(...eventsToComplete())
        .when((wf) => wf.transitionTo('SPAWN'))
      expect(result.pass).toBe(false)
    })
  })
})

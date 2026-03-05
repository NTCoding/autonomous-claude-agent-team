import {
  spec,
  eventsToDeveloping,
  eventsToReviewing,
  eventsToCrReview,
  eventsToPlanning,
  eventsToRespawn,
  developerDoneSignaled,
  reviewApproved,
  reviewRejected,
  lintRan,
  transitioned,
  planApprovalRecorded,
  agentShutDown,
  iterationTaskAssigned,
  coderabbitAddressed,
  coderabbitIgnored,
} from './workflow-test-fixtures.js'
import type { WorkflowEvent } from './workflow-events.js'

function eventsToDevelopingAtIteration1(): readonly WorkflowEvent[] {
  return [
    ...eventsToDeveloping(),
    developerDoneSignaled(),
    transitioned('DEVELOPING', 'REVIEWING'),
    reviewApproved(),
    transitioned('REVIEWING', 'COMMITTING'),
    lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
    transitioned('COMMITTING', 'RESPAWN'),
    iterationTaskAssigned('second task'),
    transitioned('RESPAWN', 'DEVELOPING', { iteration: 1, developingHeadCommit: 'abc123' }),
  ]
}

describe('Workflow', () => {
  describe('runLint', () => {
    it('records linted files when lint passes', () => {
      const { result, state } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.runLint(['src/a.ts', 'src/b.tsx']))
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.lintedFiles).toStrictEqual(['src/a.ts', 'src/b.tsx'])
      expect(state.iterations[0]?.lintRanIteration).toBe(true)
    })

    it('records 0 files when no TS files', () => {
      const { result, state } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.runLint(['README.md']))
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.lintedFiles).toStrictEqual([])
      expect(state.iterations[0]?.lintRanIteration).toBe(true)
    })

    it('returns fail when lint fails', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .withDeps({ runEslintOnFiles: () => false })
        .when((wf) => wf.runLint(['src/a.ts']))
      expect(result.pass).toBe(false)
    })

    it('throws when no iteration entry', () => {
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
        .whenThrows((wf) => wf.runLint(['src/a.ts']))
      expect(error).toHaveProperty('message', 'No iteration entry at index 0')
    })

    it('filters out non-existent files', () => {
      const { result, state } = spec
        .given(...eventsToDeveloping())
        .withDeps({ fileExists: () => false })
        .when((wf) => wf.runLint(['src/a.ts']))
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.lintedFiles).toStrictEqual([])
    })

    it('merges with existing linted files', () => {
      const { state } = spec
        .given(
          ...eventsToDeveloping(),
          lintRan({ files: 1, passed: true, lintedFiles: ['src/existing.ts'] }),
        )
        .when((wf) => wf.runLint(['src/new.ts']))
      expect(state.iterations[0]?.lintedFiles).toStrictEqual(['src/existing.ts', 'src/new.ts'])
    })

    it('deduplicates linted files', () => {
      const { state } = spec
        .given(
          ...eventsToDeveloping(),
          lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        )
        .when((wf) => wf.runLint(['src/a.ts']))
      expect(state.iterations[0]?.lintedFiles).toStrictEqual(['src/a.ts'])
    })

    it('calls runEslintOnFiles with correct config path', () => {
      const mockLint = vi.fn().mockReturnValue(true)
      spec
        .given(...eventsToDeveloping())
        .withDeps({ runEslintOnFiles: mockLint })
        .when((wf) => wf.runLint(['src/a.ts']))
      expect(mockLint).toHaveBeenCalledWith('/plugin/lint/eslint.config.mjs', ['src/a.ts'])
    })
  })

  describe('pending events', () => {
    it('emits transitioned event for transition', () => {
      const { events } = spec
        .given(...eventsToPlanning(), planApprovalRecorded())
        .when((wf) => wf.transitionTo('RESPAWN'))
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'PLANNING', to: 'RESPAWN' })])
      )
    })

    it('emits transitioned event for BLOCKED transition', () => {
      const { events } = spec
        .given(...eventsToPlanning())
        .when((wf) => wf.transitionTo('BLOCKED'))
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'PLANNING', to: 'BLOCKED' })])
      )
    })

    it('emits transitioned event for unblock transition', () => {
      const { events } = spec
        .given(
          ...eventsToPlanning(),
          transitioned('PLANNING', 'BLOCKED'),
        )
        .when((wf) => wf.transitionTo('PLANNING'))
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'transitioned', from: 'BLOCKED', to: 'PLANNING' })])
      )
    })
  })

  describe('operations with multiple iterations', () => {
    it('signalDone only updates the current iteration', () => {
      const givenEvents = eventsToDevelopingAtIteration1()
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.signalDone())
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.developerDone).toBe(true)
    })

    it('reviewApproved only updates the current iteration', () => {
      const givenEvents = [
        ...eventsToDevelopingAtIteration1(),
        developerDoneSignaled(),
        transitioned('DEVELOPING', 'REVIEWING'),
      ] as const
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.reviewApproved())
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.reviewApproved).toBe(true)
    })

    it('reviewRejected only updates the current iteration', () => {
      const givenEvents = [
        ...eventsToDevelopingAtIteration1(),
        developerDoneSignaled(),
        transitioned('DEVELOPING', 'REVIEWING'),
      ] as const
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.reviewRejected())
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.reviewRejected).toBe(true)
    })

    it('coderabbitFeedbackAddressed only updates the current iteration', () => {
      const givenEvents = [
        ...eventsToDevelopingAtIteration1(),
        developerDoneSignaled(),
        transitioned('DEVELOPING', 'REVIEWING'),
        reviewApproved(),
        transitioned('REVIEWING', 'COMMITTING'),
        lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        transitioned('COMMITTING', 'CR_REVIEW'),
      ] as const
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.coderabbitFeedbackAddressed())
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.coderabbitFeedbackAddressed).toBe(true)
    })

    it('coderabbitFeedbackIgnored only updates the current iteration', () => {
      const givenEvents = [
        ...eventsToDevelopingAtIteration1(),
        developerDoneSignaled(),
        transitioned('DEVELOPING', 'REVIEWING'),
        reviewApproved(),
        transitioned('REVIEWING', 'COMMITTING'),
        lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        transitioned('COMMITTING', 'CR_REVIEW'),
      ] as const
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.coderabbitFeedbackIgnored())
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.coderabbitFeedbackIgnored).toBe(true)
    })

    it('runLint with no TS files only updates the current iteration', () => {
      const givenEvents = eventsToDevelopingAtIteration1()
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.runLint(['README.md']))
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.lintRanIteration).toBe(true)
    })

    it('runLint with TS files only updates the current iteration', () => {
      const givenEvents = eventsToDevelopingAtIteration1()
      const givenState = spec.given(...givenEvents).when((wf) => wf.getState())
      const iteration0Before = givenState.state.iterations[0]

      const { state } = spec
        .given(...givenEvents)
        .when((wf) => wf.runLint(['src/a.ts']))
      expect(state.iterations[0]).toStrictEqual(iteration0Before)
      expect(state.iterations[1]?.lintedFiles).toStrictEqual(['src/a.ts'])
    })
  })
})

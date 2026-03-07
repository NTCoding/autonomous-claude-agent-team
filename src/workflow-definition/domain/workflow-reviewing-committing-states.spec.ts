import type { GitInfo } from '@ntcoding/agentic-workflow-builder/dsl'
import {
  spec,
  cleanGit,
  dirtyGit,
  DEFAULT_ITERATION,
  eventsToReviewing,
  eventsToCommitting,
  reviewApproved,
  reviewRejected,
  lintRan,
  transitioned,
  transitionTo,
  developerDoneSignaled,
  eventsToDeveloping,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('REVIEWING state', () => {
    it('transitions to COMMITTING when reviewApproved', () => {
      const { result, state } = spec
        .given(...eventsToReviewing(), reviewApproved())
        .when((wf) => transitionTo(wf,'COMMITTING'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.currentStateMachineState).toBe('COMMITTING')
    })

    it('fails transition to COMMITTING when not approved', () => {
      const { result } = spec
        .given(...eventsToReviewing())
        .when((wf) => transitionTo(wf,'COMMITTING'))
      expect(result.pass).toBe(false)
    })

    it('transitions to DEVELOPING when reviewRejected', () => {
      const { result } = spec
        .given(...eventsToReviewing(), reviewRejected())
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition to DEVELOPING when not rejected', () => {
      const { result } = spec
        .given(...eventsToReviewing())
        .when((wf) => transitionTo(wf,'DEVELOPING'))
      expect(result.pass).toBe(false)
    })

    it('sets reviewApproved when reviewApproved succeeds', () => {
      const { result, state } = spec
        .given(...eventsToReviewing())
        .when((wf) => wf.reviewApproved())
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.reviewApproved).toBe(true)
    })

    it('fails reviewApproved in non-REVIEWING states', () => {
      const { result } = spec.given().when((wf) => wf.reviewApproved())
      expect(result.pass).toBe(false)
    })

    it('throws reviewApproved when no iteration', () => {
      const { error } = spec
        .given(transitioned('SPAWN', 'REVIEWING'))
        .whenThrows((wf) => wf.reviewApproved())
      expect(error).toHaveProperty('message', 'No iteration at index 0')
    })

    it('sets reviewRejected when reviewRejected succeeds', () => {
      const { result, state } = spec
        .given(...eventsToReviewing())
        .when((wf) => wf.reviewRejected())
      expect(result).toStrictEqual({ pass: true })
      expect(state.iterations[0]?.reviewRejected).toBe(true)
    })

    it('fails reviewRejected in non-REVIEWING states', () => {
      const { result } = spec.given().when((wf) => wf.reviewRejected())
      expect(result.pass).toBe(false)
    })

    it('throws reviewRejected when no iteration', () => {
      const { error } = spec
        .given(transitioned('SPAWN', 'REVIEWING'))
        .whenThrows((wf) => wf.reviewRejected())
      expect(error).toHaveProperty('message', 'No iteration at index 0')
    })
  })

  describe('COMMITTING state', () => {
    it('transitions to RESPAWN when clean tree and linted and has commits', () => {
      const gitWithCommits: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const { result } = spec
        .given(
          ...eventsToCommitting(),
          lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        )
        .withDeps({ getGitInfo: () => gitWithCommits })
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('transitions to CR_REVIEW when clean tree and linted and has commits', () => {
      const gitWithCommits: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const { result } = spec
        .given(
          ...eventsToCommitting(),
          lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        )
        .withDeps({ getGitInfo: () => gitWithCommits })
        .when((wf) => transitionTo(wf,'CR_REVIEW'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('fails transition when dirty tree', () => {
      const { result } = spec
        .given(...eventsToCommitting())
        .withDeps({ getGitInfo: () => dirtyGit })
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('fails transition when lint not run', () => {
      const gitWithFiles: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts'],
      }
      const { result } = spec
        .given(...eventsToCommitting())
        .withDeps({ getGitInfo: () => gitWithFiles })
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('fails transition when unlinted files exist', () => {
      const gitWithFiles: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['src/a.ts', 'src/b.ts'],
      }
      const { result } = spec
        .given(
          ...eventsToCommitting(),
          lintRan({ files: 1, passed: true, lintedFiles: ['src/a.ts'] }),
        )
        .withDeps({ getGitInfo: () => gitWithFiles })
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('fails transition when no commits beyond default', () => {
      const { result } = spec
        .given(...eventsToCommitting())
        .when((wf) => transitionTo(wf,'RESPAWN'))
      expect(result.pass).toBe(false)
    })

    it('succeeds transition with no TS files even without lint', () => {
      const gitWithCommitsNoTs: GitInfo = {
        ...cleanGit,
        hasCommitsVsDefault: true,
        changedFilesVsDefault: ['README.md'],
      }
      const { result } = spec
        .given(...eventsToCommitting())
        .withDeps({ getGitInfo: () => gitWithCommitsNoTs })
        .when((wf) => transitionTo(wf,'CR_REVIEW'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('calls deps.tickFirstUncheckedIteration when tickIteration succeeds', () => {
      const mockTick = vi.fn()
      const { result } = spec
        .given(...eventsToCommitting())
        .withDeps({ tickFirstUncheckedIteration: mockTick })
        .when((wf) => wf.tickIteration(42))
      expect(result).toStrictEqual({ pass: true })
      expect(mockTick).toHaveBeenCalledWith(42)
    })

    it('fails tickIteration in non-COMMITTING states', () => {
      const { result } = spec.given().when((wf) => wf.tickIteration(42))
      expect(result.pass).toBe(false)
    })
  })
})

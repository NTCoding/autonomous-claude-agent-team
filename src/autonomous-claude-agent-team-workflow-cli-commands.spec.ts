import { runWorkflow } from './autonomous-claude-agent-team-workflow.js'
import { EXIT_ERROR, EXIT_ALLOW, EXIT_BLOCK } from './infra/hook-io.js'
import {
  makeDeps,
  spawnReadyEvents,
  planningEvents,
  developingEvents,
  reviewingEvents,
  committingEvents,
  crReviewEvents,
  prCreationEvents,
} from './autonomous-claude-agent-team-workflow-cli-test-fixtures.js'

describe('runWorkflow - CLI command routing', () => {
  it('dispatches init and returns success', () => {
    const result = runWorkflow(['init'], makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })

  it('dispatches run-lint with no files and returns success when no session', () => {
    const result = runWorkflow(['run-lint'], makeDeps({
      engineDeps: { store: { sessionExists: () => false } },
    }))
    expect(result.exitCode).toStrictEqual(0)
  })

  it('dispatches run-lint with no files and returns success when session exists with iteration', () => {
    const result = runWorkflow(['run-lint'], makeDeps({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => developingEvents() },
      },
    }))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('run-lint')
  })

  it('dispatches run-lint and returns EXIT_BLOCK when lint fails', () => {
    const result = runWorkflow(['run-lint', '/project/src/bad.ts'], makeDeps({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => developingEvents() },
      },
      workflowDeps: {
        fileExists: () => true,
        runEslintOnFiles: () => false,
      },
    }))
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches create-pr and returns success when in PR_CREATION state', () => {
    const result = runWorkflow(
      ['create-pr', 'My PR title', 'My PR body'],
      makeDeps({ engineDeps: { store: { readEvents: () => prCreationEvents() } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches append-issue-checklist and returns success when in PLANNING state', () => {
    const result = runWorkflow(
      ['append-issue-checklist', '10', '- [ ] Iteration 1: task'],
      makeDeps({ engineDeps: { store: { readEvents: () => planningEvents() } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches tick-iteration and returns success when in COMMITTING state', () => {
    const result = runWorkflow(
      ['tick-iteration', '10'],
      makeDeps({ engineDeps: { store: { readEvents: () => committingEvents() } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })
})

describe('runWorkflow - CLI command dispatch', () => {
  it('dispatches transition and returns EXIT_BLOCK when guard fails', () => {
    const result = runWorkflow(['transition', 'PLANNING'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches transition with valid state and returns success', () => {
    const result = runWorkflow(['transition', 'PLANNING'], makeDeps({
      engineDeps: {
        store: { readEvents: () => spawnReadyEvents() },
      },
    }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches record-issue with valid number in SPAWN state and returns success', () => {
    const result = runWorkflow(['record-issue', '42'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches record-branch and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['record-branch', 'feature/foo'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches record-pr with valid number and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['record-pr', '7'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

describe('runWorkflow - new review and coderabbit commands', () => {
  it('dispatches review-approved and returns success when in REVIEWING state', () => {
    const result = runWorkflow(['review-approved'], makeDeps({ engineDeps: { store: { readEvents: () => reviewingEvents() } } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Review approved')
  })

  it('dispatches review-approved and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['review-approved'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches review-rejected and returns success when in REVIEWING state', () => {
    const result = runWorkflow(['review-rejected'], makeDeps({ engineDeps: { store: { readEvents: () => reviewingEvents() } } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Review rejected')
  })

  it('dispatches review-rejected and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['review-rejected'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches coderabbit-feedback-addressed and returns success when in CR_REVIEW state', () => {
    const result = runWorkflow(['coderabbit-feedback-addressed'], makeDeps({ engineDeps: { store: { readEvents: () => crReviewEvents() } } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('CodeRabbit feedback marked as addressed')
  })

  it('dispatches coderabbit-feedback-addressed and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['coderabbit-feedback-addressed'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches coderabbit-feedback-ignored and returns success when in CR_REVIEW state', () => {
    const result = runWorkflow(['coderabbit-feedback-ignored'], makeDeps({ engineDeps: { store: { readEvents: () => crReviewEvents() } } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('CodeRabbit feedback marked as ignored')
  })

  it('dispatches coderabbit-feedback-ignored and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['coderabbit-feedback-ignored'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

describe('runWorkflow - analyze command', () => {
  it('returns EXIT_ERROR when no sessionId or --all is given', () => {
    const result = runWorkflow(['analyze'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ALLOW and calls computeSession with the given sessionId', () => {
    const calledWith: string[] = []
    const result = runWorkflow(['analyze', 'my-session'], makeDeps({
      analyticsDeps: {
        computeSession: (sessionId) => {
          calledWith.push(sessionId)
          return 'Session: my-session\n==='
        },
      },
    }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(calledWith[0]).toStrictEqual('my-session')
  })

  it('returns EXIT_ALLOW and calls computeAll when --all is given', () => {
    const computeAllCalls: string[] = []
    const result = runWorkflow(['analyze', '--all'], makeDeps({
      analyticsDeps: {
        computeAll: () => {
          computeAllCalls.push('called')
          return 'Total Sessions: 5'
        },
      },
    }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(computeAllCalls).toHaveLength(1)
  })
})

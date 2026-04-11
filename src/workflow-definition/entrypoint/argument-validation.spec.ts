import { runWorkflow } from './entrypoint.js'
import { EXIT_ERROR, EXIT_ALLOW } from '@ntcoding/agentic-workflow-builder/cli'
import type { WorkflowEvent } from '../index.js'
import { makeDeps } from './cli-test-fixtures.js'

const AT = '2026-01-01T00:00:00Z'

describe('runWorkflow - unknown commands', () => {
  it('returns EXIT_ERROR with unknown command message for unrecognised command', () => {
    const result = runWorkflow(['bad-command'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('Unknown command: bad-command')
  })
})

describe('runWorkflow - transition argument validation', () => {
  it('returns EXIT_ERROR when state argument is missing', () => {
    const result = runWorkflow(['transition'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR for unrecognised state name', () => {
    const result = runWorkflow(['transition', 'NOT_A_STATE'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('invalid state')
  })
})

describe('runWorkflow - record-issue argument validation', () => {
  it('returns EXIT_ERROR when issue number argument is missing', () => {
    const result = runWorkflow(['record-issue'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when issue number is not numeric', () => {
    const result = runWorkflow(['record-issue', 'abc'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('not a valid number')
  })
})

describe('runWorkflow - record-branch argument validation', () => {
  it('returns EXIT_ERROR when branch argument is missing', () => {
    const result = runWorkflow(['record-branch'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow - assign-iteration-task argument validation', () => {
  it('returns EXIT_ERROR when task argument is missing', () => {
    const result = runWorkflow(['assign-iteration-task'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow - record-pr argument validation', () => {
  it('returns EXIT_ERROR when pr number argument is missing', () => {
    const result = runWorkflow(['record-pr'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when pr number is not numeric', () => {
    const result = runWorkflow(['record-pr', 'xyz'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('not a valid number')
  })
})

describe('runWorkflow - create-pr argument validation', () => {
  it('returns EXIT_ERROR when title argument is missing', () => {
    const result = runWorkflow(['create-pr'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when body argument is missing', () => {
    const result = runWorkflow(['create-pr', 'My Title'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow - append-issue-checklist argument validation', () => {
  it('returns EXIT_ERROR when issue number argument is missing', () => {
    const result = runWorkflow(['append-issue-checklist'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when issue number is not numeric', () => {
    const result = runWorkflow(['append-issue-checklist', 'abc'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('not a valid number')
  })

  it('returns EXIT_ERROR when checklist argument is missing', () => {
    const result = runWorkflow(['append-issue-checklist', '42'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow - tick-iteration argument validation', () => {
  it('returns EXIT_ERROR when issue number argument is missing', () => {
    const result = runWorkflow(['tick-iteration'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when issue number is not numeric', () => {
    const result = runWorkflow(['tick-iteration', 'xyz'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('not a valid number')
  })
})

describe('runWorkflow - shut-down argument validation', () => {
  it('returns EXIT_ERROR when agent name argument is missing', () => {
    const result = runWorkflow(['shut-down'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('throws when no session exists', () => {
    expect(() => runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )).toThrow("No session found for 'test-session'. Run init first.")
  })

  it('dispatches shut-down and returns success when session exists', () => {
    const result = runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: (): readonly WorkflowEvent[] => [
              { type: 'session-started', at: AT, transcriptPath: '/test/transcript.jsonl' },
              { type: 'agent-registered', at: AT, agentType: 'developer-1', agentId: 'agt-1' },
            ],
          },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('shut-down')
  })
})

import { runWorkflow } from './entrypoint.js'
import { EXIT_ERROR, EXIT_ALLOW } from '@ntcoding/agentic-workflow-builder/cli'
import type { WorkflowEvent } from '../index.js'
import {
  makeDeps,
  planningEvents,
  developingEvents,
} from './cli-test-fixtures.js'

const AT = '2026-01-01T00:00:00Z'

describe('runWorkflow - record-plan-approval command', () => {
  it('dispatches record-plan-approval and returns success when in PLANNING state', () => {
    const result = runWorkflow(
      ['record-plan-approval'],
      makeDeps({ engineDeps: { store: { readEvents: () => planningEvents() } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Plan approved')
  })
})

describe('runWorkflow - assign-iteration-task command', () => {
  it('dispatches assign-iteration-task and returns success when in RESPAWN state', () => {
    const respawnEvents: readonly WorkflowEvent[] = [
      ...planningEvents(),
      { type: 'plan-approval-recorded', at: AT },
      { type: 'transitioned', at: AT, from: 'PLANNING', to: 'RESPAWN', iteration: 0 },
    ]
    const result = runWorkflow(
      ['assign-iteration-task', 'Build the thing'],
      makeDeps({ engineDeps: { store: { readEvents: () => respawnEvents } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Iteration task set')
  })
})

describe('runWorkflow - signal-done command', () => {
  it('dispatches signal-done and returns success when in DEVELOPING state', () => {
    const result = runWorkflow(
      ['signal-done'],
      makeDeps({ engineDeps: { store: { readEvents: () => developingEvents() } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Developer signaled completion')
  })
})

describe('runWorkflow - write-journal command', () => {
  it('returns EXIT_ERROR when agent name is missing', () => {
    const result = runWorkflow(['write-journal'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when content is missing', () => {
    const result = runWorkflow(['write-journal', 'developer-1'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('throws when no session exists', () => {
    expect(() => runWorkflow(
      ['write-journal', 'developer-1', 'My summary'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )).toThrow("No session found for 'test-session'. Run init first.")
  })

  it('returns EXIT_ALLOW and appends journal-entry event when session exists', () => {
    const appended: Array<{ sessionId: string; firstEventType: string }> = []
    const result = runWorkflow(
      ['write-journal', 'developer-1', 'Finished auth module'],
      makeDeps({
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: () => [],
            appendEvents: (sessionId, events) => appended.push({ sessionId, firstEventType: events[0]?.type ?? '' }),
          },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(appended[0]?.firstEventType).toStrictEqual('journal-entry')
  })
})

describe('runWorkflow - get-session-summary command', () => {
  it('throws when no session exists', () => {
    expect(() => runWorkflow(
      ['get-session-summary'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )).toThrow("No session found for 'test-session'. Run init first.")
  })

  it('returns EXIT_ALLOW with state summary when session exists', () => {
    const result = runWorkflow(
      ['get-session-summary'],
      makeDeps({
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => developingEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('DEVELOPING')
  })

  it('appends context-requested event when session exists', () => {
    const appended: Array<{ firstEventType: string }> = []
    runWorkflow(
      ['get-session-summary', 'developer-1'],
      makeDeps({
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: () => [],
            appendEvents: (_sessionId, events) => appended.push({ firstEventType: events[0]?.type ?? '' }),
          },
        },
      }),
    )
    expect(appended[0]?.firstEventType).toStrictEqual('context-requested')
  })
})

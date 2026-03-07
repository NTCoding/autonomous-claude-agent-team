import { handleHookRoute } from './hook-routes.js'
import { EXIT_ERROR, EXIT_ALLOW, EXIT_BLOCK } from './infra/hook-io.js'
import {
  makeDeps,
  makeHookStdin,
  planningEvents,
  developingEvents,
} from './autonomous-claude-agent-team-workflow-cli-test-fixtures.js'
import type { WorkflowEvent } from './workflow-definition/index.js'

const AT = '2026-01-01T00:00:00Z'

describe('handleHookRoute', () => {
  it('routes SessionStart to persist-session-id and appends session id to env file', () => {
    const appended: string[] = []
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'SessionStart' }),
        engineDeps: { appendToFile: (_: string, content: string) => appended.push(content) },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(appended[0]).toContain("CLAUDE_SESSION_ID='test-session'")
  })

  it('routes PreToolUse and returns EXIT_ALLOW with no session', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('returns EXIT_BLOCK from PreToolUse when write is blocked', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () =>
          makeHookStdin({
            hook_event_name: 'PreToolUse',
            tool_name: 'Write',
            tool_input: { file_path: '/project/src/foo.ts' },
          }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => [
            { type: 'transitioned', at: AT, from: 'SPAWN', to: 'RESPAWN' },
          ] },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('returns EXIT_BLOCK from PreToolUse when plugin source read is blocked', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () =>
          makeHookStdin({
            hook_event_name: 'PreToolUse',
            tool_name: 'Read',
            tool_input: { file_path: '/home/.claude/plugins/cache/myplugin/src/index.ts' },
          }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => [] },
        },
        workflowDeps: {
          getPluginRoot: () => '/home/.claude/plugins/cache/myplugin',
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('returns EXIT_BLOCK from PreToolUse when bash command is blocked', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () =>
          makeHookStdin({
            hook_event_name: 'PreToolUse',
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m "test"' },
          }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => developingEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('returns empty output from PreToolUse when all checks pass', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => planningEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('')
  })

  it('routes SubagentStart and returns EXIT_ALLOW with no session', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'SubagentStart', agent_id: 'agt-1', agent_type: 'developer-1' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('SubagentStart appends agent-registered event when session exists', () => {
    const appended: Array<{ sessionId: string; firstEventType: string }> = []
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({
          hook_event_name: 'SubagentStart',
          session_id: 'parent-session',
          agent_id: 'agt-1',
          agent_type: 'developer-1',
        }),
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
    expect(appended[0]?.firstEventType).toStrictEqual('agent-registered')
  })

  it('routes TeammateIdle and returns EXIT_ALLOW with no session', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('TeammateIdle allows unnamed agent', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle' }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => developingEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('TeammateIdle allows non-lead agent in DEVELOPING state', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle', teammate_name: 'reviewer-1' }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => developingEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('TeammateIdle blocks lead agent in non-BLOCKED state', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle', teammate_name: 'lead-1' }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => developingEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
    expect(result.output).toContain('Lead cannot go idle')
  })

  it('throws when tool_input contains a non-string value', () => {
    expect(() => handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: { file_path: 42 },
        }),
      }),
    )).toThrow('Expected string or undefined')
  })

  it('returns EXIT_ERROR for unrecognised hook event', () => {
    const result = handleHookRoute(
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'UnknownEvent' }) }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('Unknown hook event: UnknownEvent')
  })

  it('PreToolUse records identity-verified event via engine prefix verification', () => {
    const appended: Array<{ firstEventType: string }> = []
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: () => planningEvents(),
            appendEvents: (_sessionId: string, events: readonly WorkflowEvent[]) => appended.push({ firstEventType: events[0]?.type ?? '' }),
          },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(appended[0]?.firstEventType).toStrictEqual('identity-verified')
  })

  it('PreToolUse blocks when identity is lost', () => {
    const result = handleHookRoute(
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          transcriptReader: {
            readMessages: () => [
              { id: '1', textContent: 'LEAD: PLANNING' },
              { id: '2', textContent: 'No prefix here' },
            ],
          },
          store: { sessionExists: () => true, readEvents: () => planningEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

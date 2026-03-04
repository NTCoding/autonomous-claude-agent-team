import { runWorkflow } from './autonomous-claude-agent-team-workflow.js'
import type { AdapterDeps, AnalyticsDeps } from './autonomous-claude-agent-team-workflow.js'
import type { WorkflowEngineDeps, WorkflowEventStore, WorkflowRuntimeDeps } from './workflow-engine/index.js'
import type { WorkflowEvent } from './workflow-definition/index.js'
import { EXIT_ERROR, EXIT_ALLOW, EXIT_BLOCK } from './infra/hook-io.js'

const AT = '2026-01-01T00:00:00Z'

function makeHookStdin(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: 'test-session',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: {},
    tool_use_id: 'tool-1',
    ...overrides,
  })
}

function spawnReadyEvents(): readonly WorkflowEvent[] {
  return [
    { type: 'issue-recorded', at: AT, issueNumber: 42 },
    { type: 'agent-registered', at: AT, agentType: 'developer-1', agentId: 'agt-1' },
    { type: 'agent-registered', at: AT, agentType: 'reviewer-1', agentId: 'agt-2' },
  ]
}

function planningEvents(): readonly WorkflowEvent[] {
  return [
    ...spawnReadyEvents(),
    { type: 'transitioned', at: AT, from: 'SPAWN', to: 'PLANNING' },
  ]
}

function developingEvents(): readonly WorkflowEvent[] {
  return [
    ...planningEvents(),
    { type: 'iteration-task-assigned', at: AT, task: 'Build the thing' },
    { type: 'transitioned', at: AT, from: 'PLANNING', to: 'RESPAWN', iteration: 0 },
    { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING', iteration: 0, developingHeadCommit: 'abc123' },
  ]
}

function reviewingEvents(): readonly WorkflowEvent[] {
  return [
    ...developingEvents(),
    { type: 'developer-done-signaled', at: AT },
    { type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'REVIEWING' },
  ]
}

function committingEvents(): readonly WorkflowEvent[] {
  return [
    ...reviewingEvents(),
    { type: 'review-approved', at: AT },
    { type: 'transitioned', at: AT, from: 'REVIEWING', to: 'COMMITTING' },
  ]
}

function crReviewEvents(): readonly WorkflowEvent[] {
  return [
    ...committingEvents(),
    { type: 'pr-created', at: AT, prNumber: 99 },
    { type: 'transitioned', at: AT, from: 'COMMITTING', to: 'CR_REVIEW' },
  ]
}

function prCreationEvents(): readonly WorkflowEvent[] {
  return [
    ...crReviewEvents(),
    { type: 'coderabbit-addressed', at: AT },
    { type: 'transitioned', at: AT, from: 'CR_REVIEW', to: 'PR_CREATION' },
  ]
}

type EngineDepsOverrides = { store?: Partial<WorkflowEventStore> } & Partial<Omit<WorkflowEngineDeps, 'store'>>

function makeStore(overrides?: Partial<WorkflowEventStore>): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => true,
    ...overrides,
  }
}

function makeEngineDeps(overrides?: EngineDepsOverrides): WorkflowEngineDeps {
  const { store: storeOverrides, ...rest } = overrides ?? {}
  return {
    store: makeStore(storeOverrides),
    getPluginRoot: () => '/plugin',
    getEnvFilePath: () => '/test/claude.env',
    readFile: () => '',
    appendToFile: () => undefined,
    now: () => AT,
    ...rest,
  }
}

function makeWorkflowDeps(overrides?: Partial<WorkflowRuntimeDeps>): WorkflowRuntimeDeps {
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
    now: () => AT,
    readTranscriptMessages: () => [],
    ...overrides,
  }
}

function makeAnalyticsDeps(overrides?: Partial<AnalyticsDeps>): AnalyticsDeps {
  return {
    computeSession: (_sessionId: string) => 'Session: test-session\n===',
    computeAll: () => 'Total Sessions: 0',
    computeEventContext: (_sessionId: string) => 'Session: test-session\nState: SPAWN (iteration: 0)',
    ...overrides,
  }
}

function makeDeps(overrides?: {
  engineDeps?: EngineDepsOverrides
  workflowDeps?: Partial<WorkflowRuntimeDeps>
  analyticsDeps?: Partial<AnalyticsDeps>
  getSessionId?: () => string
  readStdin?: () => string
}): AdapterDeps {
  return {
    getSessionId: overrides?.getSessionId ?? (() => 'test-session'),
    readStdin: overrides?.readStdin ?? (() => makeHookStdin()),
    engineDeps: makeEngineDeps(overrides?.engineDeps),
    workflowDeps: makeWorkflowDeps(overrides?.workflowDeps),
    analyticsDeps: makeAnalyticsDeps(overrides?.analyticsDeps),
    reportDeps: { generateReport: () => '/tmp/report.html' },
  }
}

describe('runWorkflow - hook mode routing', () => {
  it('routes SessionStart to persist-session-id and appends session id to env file', () => {
    const appended: string[] = []
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'SessionStart' }),
        engineDeps: { appendToFile: (_: string, content: string) => appended.push(content) },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(appended[0]).toContain("CLAUDE_SESSION_ID='test-session'")
  })

  it('routes PreToolUse and returns EXIT_ALLOW with no session', () => {
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('returns EXIT_BLOCK from PreToolUse when write is blocked', () => {
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'SubagentStart', agent_id: 'agt-1', agent_type: 'developer-1' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('SubagentStart appends agent-registered event when session exists', () => {
    const appended: Array<{ sessionId: string; firstEventType: string }> = []
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle' }),
        engineDeps: { store: { sessionExists: () => false } },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('TeammateIdle allows unnamed agent', () => {
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
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
    expect(() => runWorkflow(
      [],
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
    const result = runWorkflow(
      [],
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'UnknownEvent' }) }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('Unknown hook event: UnknownEvent')
  })
})

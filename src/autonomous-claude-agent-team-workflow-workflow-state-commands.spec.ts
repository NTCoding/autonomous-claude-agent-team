import { runWorkflow } from './autonomous-claude-agent-team-workflow.js'
import type { AdapterDeps, ViewerDeps, AnalyticsDeps } from './autonomous-claude-agent-team-workflow.js'
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
    sessionExists: () => false,
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

function makeViewerDeps(overrides?: Partial<ViewerDeps>): ViewerDeps {
  return {
    startViewer: () => ({
      url: 'http://localhost:9999',
      close: () => undefined,
    }),
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
  viewerDeps?: Partial<ViewerDeps>
  analyticsDeps?: Partial<AnalyticsDeps>
  getSessionId?: () => string
  readStdin?: () => string
}): AdapterDeps {
  return {
    getSessionId: overrides?.getSessionId ?? (() => 'test-session'),
    readStdin: overrides?.readStdin ?? (() => makeHookStdin()),
    engineDeps: makeEngineDeps(overrides?.engineDeps),
    workflowDeps: makeWorkflowDeps(overrides?.workflowDeps),
    viewerDeps: makeViewerDeps(overrides?.viewerDeps),
    analyticsDeps: makeAnalyticsDeps(overrides?.analyticsDeps),
  }
}

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

  it('returns EXIT_ERROR when no session exists', () => {
    const result = runWorkflow(
      ['write-journal', 'developer-1', 'My summary'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('no session')
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

describe('runWorkflow - event-context command', () => {
  it('returns EXIT_ERROR when no session exists', () => {
    const result = runWorkflow(
      ['event-context'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('no session')
  })

  it('returns EXIT_ALLOW with output from computeEventContext when session exists', () => {
    const result = runWorkflow(
      ['event-context'],
      makeDeps({
        engineDeps: { store: { sessionExists: () => true } },
        analyticsDeps: { computeEventContext: () => 'Session: test-session\nState: DEVELOPING (iteration: 0)' },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('DEVELOPING')
  })

  it('passes sessionId to computeEventContext', () => {
    const calls: string[] = []
    runWorkflow(
      ['event-context'],
      makeDeps({
        engineDeps: { store: { sessionExists: () => true } },
        analyticsDeps: { computeEventContext: (id) => { calls.push(id); return '' } },
      }),
    )
    expect(calls[0]).toStrictEqual('test-session')
  })

  it('appends context-requested event when session exists', () => {
    const appended: Array<{ firstEventType: string }> = []
    runWorkflow(
      ['event-context', 'developer-1'],
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

  it('PreToolUse records identity-verified event via verifyIdentity', () => {
    const appended: Array<{ firstEventType: string }> = []
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: () => planningEvents(),
            appendEvents: (_sessionId, events) => appended.push({ firstEventType: events[0]?.type ?? '' }),
          },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(appended[0]?.firstEventType).toStrictEqual('identity-verified')
  })

  it('PreToolUse blocks when identity is lost', () => {
    const result = runWorkflow(
      [],
      makeDeps({
        workflowDeps: {
          readTranscriptMessages: () => [
            { id: '1', hasTextContent: true, startsWithLeadPrefix: true },
            { id: '2', hasTextContent: true, startsWithLeadPrefix: false },
          ],
        },
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          store: { sessionExists: () => true, readEvents: () => planningEvents() },
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

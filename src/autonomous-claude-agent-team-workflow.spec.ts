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

describe('runWorkflow - CLI command routing', () => {
  it('dispatches init and returns success', () => {
    const result = runWorkflow(['init'], makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })

  it('dispatches run-lint with no files and returns success when no session', () => {
    const result = runWorkflow(['run-lint'], makeDeps())
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
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }) }),
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
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'SubagentStart', agent_id: 'agt-1', agent_type: 'developer-1' }) }),
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
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'TeammateIdle' }) }),
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

  it('returns EXIT_ERROR for unrecognised hook event', () => {
    const result = runWorkflow(
      [],
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'UnknownEvent' }) }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('Unknown hook event: UnknownEvent')
  })
})

describe('runWorkflow - shut-down argument validation', () => {
  it('returns EXIT_ERROR when agent name argument is missing', () => {
    const result = runWorkflow(['shut-down'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when no session exists', () => {
    const result = runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({ engineDeps: { store: { sessionExists: () => false } } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('no state file')
  })

  it('dispatches shut-down and returns success when session exists', () => {
    const result = runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({
        engineDeps: {
          store: {
            sessionExists: () => true,
            readEvents: (): readonly WorkflowEvent[] => [
              { type: 'session-started', at: AT, sessionId: 'test-session' },
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

describe('runWorkflow - view command', () => {
  it('returns EXIT_ALLOW and outputs the server URL', () => {
    const result = runWorkflow(['view'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('http://localhost:9999')
  })

  it('calls startViewer', () => {
    const calls: string[] = []
    runWorkflow(['view'], makeDeps({
      viewerDeps: {
        startViewer: () => {
          calls.push('called')
          return { url: 'http://localhost:9999', close: () => undefined }
        },
      },
    }))
    expect(calls).toHaveLength(1)
  })

  it('returns the URL from the viewer server', () => {
    const result = runWorkflow(['view'], makeDeps({
      viewerDeps: {
        startViewer: () => ({ url: 'http://localhost:5678', close: () => undefined }),
      },
    }))
    expect(result.output).toStrictEqual('http://localhost:5678')
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

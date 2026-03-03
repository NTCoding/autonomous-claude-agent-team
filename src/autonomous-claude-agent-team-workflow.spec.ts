import { runWorkflow } from './autonomous-claude-agent-team-workflow.js'
import type { AdapterDeps, ViewerDeps } from './autonomous-claude-agent-team-workflow.js'
import type { WorkflowState } from './workflow-engine/index.js'
import type { WorkflowEngineDeps, WorkflowRuntimeDeps } from './workflow-engine/index.js'
import { INITIAL_STATE } from './workflow-definition/index.js'
import { EXIT_ERROR, EXIT_ALLOW, EXIT_BLOCK } from './infra/hook-io.js'

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

function makeIterationState(): WorkflowState {
  return {
    ...INITIAL_STATE,
    iterations: [{
      task: 'Iteration 1',
      developerDone: false,
      reviewApproved: false,
      reviewRejected: false,
      coderabbitFeedbackAddressed: false,
      coderabbitFeedbackIgnored: false,
      lintedFiles: [],
      lintRanIteration: false,
    }],
  }
}

function makeEngineDeps(overrides?: Partial<WorkflowEngineDeps>): WorkflowEngineDeps {
  return {
    readState: () => INITIAL_STATE,
    writeState: () => undefined,
    stateFileExists: () => false,
    getStateFilePath: (id: string) => `/test/state-${id}.json`,
    getPluginRoot: () => '/plugin',
    getEnvFilePath: () => '/test/claude.env',
    readFile: () => '',
    readTranscriptMessages: () => [],
    appendToFile: () => undefined,
    now: () => '2026-01-01T00:00:00Z',
    ...overrides,
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
    now: () => '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeViewerDeps(overrides?: Partial<ViewerDeps>): ViewerDeps {
  return {
    startViewer: (_dbPath: string) => ({
      url: 'http://localhost:9999',
      close: () => undefined,
    }),
    ...overrides,
  }
}

function makeDeps(overrides?: {
  engineDeps?: Partial<WorkflowEngineDeps>
  workflowDeps?: Partial<WorkflowRuntimeDeps>
  viewerDeps?: Partial<ViewerDeps>
  getSessionId?: () => string
  readStdin?: () => string
}): AdapterDeps {
  return {
    getSessionId: overrides?.getSessionId ?? (() => 'test-session'),
    readStdin: overrides?.readStdin ?? (() => makeHookStdin()),
    engineDeps: makeEngineDeps(overrides?.engineDeps),
    workflowDeps: makeWorkflowDeps(overrides?.workflowDeps),
    viewerDeps: makeViewerDeps(overrides?.viewerDeps),
  }
}

describe('runWorkflow — unknown commands', () => {
  it('returns EXIT_ERROR with unknown command message for unrecognised command', () => {
    const result = runWorkflow(['bad-command'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('Unknown command: bad-command')
  })
})

describe('runWorkflow — transition argument validation', () => {
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

describe('runWorkflow — record-issue argument validation', () => {
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

describe('runWorkflow — record-branch argument validation', () => {
  it('returns EXIT_ERROR when branch argument is missing', () => {
    const result = runWorkflow(['record-branch'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow — assign-iteration-task argument validation', () => {
  it('returns EXIT_ERROR when task argument is missing', () => {
    const result = runWorkflow(['assign-iteration-task'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })
})

describe('runWorkflow — record-pr argument validation', () => {
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

describe('runWorkflow — create-pr argument validation', () => {
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

describe('runWorkflow — append-issue-checklist argument validation', () => {
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

describe('runWorkflow — tick-iteration argument validation', () => {
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

describe('runWorkflow — CLI command routing', () => {
  it('dispatches init and returns success', () => {
    const result = runWorkflow(['init'], makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })

  it('dispatches run-lint with no files and returns success when no state file', () => {
    const result = runWorkflow(['run-lint'], makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })

  it('dispatches run-lint with no files and returns success when state file exists', () => {
    const state = { ...makeIterationState(), state: 'DEVELOPING' as const }
    const result = runWorkflow(['run-lint'], makeDeps({
      engineDeps: {
        stateFileExists: () => true,
        readState: () => state,
      },
    }))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('Lint passed')
  })

  it('dispatches run-lint and returns EXIT_BLOCK when lint fails', () => {
    const state = { ...makeIterationState(), state: 'DEVELOPING' as const }
    const result = runWorkflow(['run-lint', '/project/src/bad.ts'], makeDeps({
      engineDeps: {
        stateFileExists: () => true,
        readState: () => state,
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
      makeDeps({ engineDeps: { readState: () => ({ ...INITIAL_STATE, state: 'PR_CREATION' }) } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches append-issue-checklist and returns success when in PLANNING state', () => {
    const result = runWorkflow(
      ['append-issue-checklist', '10', '- [ ] Iteration 1: task'],
      makeDeps({ engineDeps: { readState: () => ({ ...INITIAL_STATE, state: 'PLANNING' }) } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches tick-iteration and returns success when in COMMITTING state', () => {
    const result = runWorkflow(
      ['tick-iteration', '10'],
      makeDeps({ engineDeps: { readState: () => ({ ...INITIAL_STATE, state: 'COMMITTING' }) } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })
})

describe('runWorkflow — hook mode routing', () => {
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

  it('routes PreToolUse and returns EXIT_ALLOW with no state file', () => {
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
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'RESPAWN' }),
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
          stateFileExists: () => true,
          readState: () => INITIAL_STATE,
        },
        workflowDeps: {
          getPluginRoot: () => '/home/.claude/plugins/cache/myplugin',
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('returns EXIT_BLOCK from PreToolUse when bash commit is blocked', () => {
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
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'DEVELOPING' }),
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('returns empty output from PreToolUse when all checks pass and identity is verified', () => {
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'PLANNING' }),
          readTranscriptMessages: () => [
            { id: '1', hasTextContent: true, startsWithLeadPrefix: true },
          ],
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('')
  })

  it('returns additionalContext from PreToolUse when verify-identity detects identity loss', () => {
    const result = runWorkflow(
      [],
      makeDeps({
        readStdin: () => makeHookStdin({ hook_event_name: 'PreToolUse' }),
        engineDeps: {
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'PLANNING' }),
          readTranscriptMessages: () => [
            { id: '1', hasTextContent: true, startsWithLeadPrefix: true },
            { id: '2', hasTextContent: true, startsWithLeadPrefix: false },
          ],
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('additionalContext')
  })

  it('routes SubagentStart and returns EXIT_ALLOW with no state file', () => {
    const result = runWorkflow(
      [],
      makeDeps({ readStdin: () => makeHookStdin({ hook_event_name: 'SubagentStart', agent_id: 'agt-1', agent_type: 'developer-1' }) }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('SubagentStart uses hook input session ID to find state file', () => {
    const written: { path: string }[] = []
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
          stateFileExists: (path: string) => path.includes('parent-session'),
          readState: () => INITIAL_STATE,
          writeState: (path: string) => { written.push({ path }) },
          getStateFilePath: (id: string) => `/test/state-${id}.json`,
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(written[0]?.path).toContain('parent-session')
  })

  it('routes TeammateIdle and returns EXIT_ALLOW with no state file', () => {
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
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'DEVELOPING' }),
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
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'DEVELOPING' }),
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
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, state: 'DEVELOPING' }),
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

describe('runWorkflow — shut-down argument validation', () => {
  it('returns EXIT_ERROR when agent name argument is missing', () => {
    const result = runWorkflow(['shut-down'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  it('returns EXIT_ERROR when no state file exists', () => {
    const result = runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({ engineDeps: { stateFileExists: () => false } }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('no state file')
  })

  it('dispatches shut-down and returns success when state file exists', () => {
    const result = runWorkflow(
      ['shut-down', 'developer-1'],
      makeDeps({
        engineDeps: {
          stateFileExists: () => true,
          readState: () => ({ ...INITIAL_STATE, activeAgents: ['developer-1'] }),
        },
      }),
    )
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('deregistered')
  })
})

describe('runWorkflow — CLI command dispatch', () => {
  it('dispatches transition and returns EXIT_BLOCK when guard fails', () => {
    const result = runWorkflow(['transition', 'PLANNING'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches transition with valid state and returns success', () => {
    const spawnReady = {
      ...INITIAL_STATE,
      githubIssue: 42,
      activeAgents: ['developer-1', 'reviewer-1'],
    }
    const result = runWorkflow(['transition', 'PLANNING'], makeDeps({
      engineDeps: { readState: () => spawnReady },
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

  it('dispatches record-plan-approval and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['record-plan-approval'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches assign-iteration-task and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['assign-iteration-task', 'Iteration 1: Add foo'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches signal-done and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['signal-done'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches record-pr with valid number and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['record-pr', '7'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

describe('runWorkflow — new review and coderabbit commands', () => {
  it('dispatches review-approved and returns success when in REVIEWING state', () => {
    const state = { ...makeIterationState(), state: 'REVIEWING' as const }
    const result = runWorkflow(['review-approved'], makeDeps({ engineDeps: { readState: () => state } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Review approved')
  })

  it('dispatches review-approved and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['review-approved'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches review-rejected and returns success when in REVIEWING state', () => {
    const state = { ...makeIterationState(), state: 'REVIEWING' as const }
    const result = runWorkflow(['review-rejected'], makeDeps({ engineDeps: { readState: () => state } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('Review rejected')
  })

  it('dispatches review-rejected and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['review-rejected'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches coderabbit-feedback-addressed and returns success when in CR_REVIEW state', () => {
    const state = { ...makeIterationState(), state: 'CR_REVIEW' as const }
    const result = runWorkflow(['coderabbit-feedback-addressed'], makeDeps({ engineDeps: { readState: () => state } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('CodeRabbit feedback marked as addressed')
  })

  it('dispatches coderabbit-feedback-addressed and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['coderabbit-feedback-addressed'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })

  it('dispatches coderabbit-feedback-ignored and returns success when in CR_REVIEW state', () => {
    const state = { ...makeIterationState(), state: 'CR_REVIEW' as const }
    const result = runWorkflow(['coderabbit-feedback-ignored'], makeDeps({ engineDeps: { readState: () => state } }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toContain('CodeRabbit feedback marked as ignored')
  })

  it('dispatches coderabbit-feedback-ignored and returns gate error for SPAWN state', () => {
    const result = runWorkflow(['coderabbit-feedback-ignored'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_BLOCK)
  })
})

describe('runWorkflow — view command', () => {
  it('returns EXIT_ALLOW and outputs the server URL', () => {
    const result = runWorkflow(['view'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('http://localhost:9999')
  })

  it('calls startViewer with the db path', () => {
    const calledWith: string[] = []
    const result = runWorkflow(['view'], makeDeps({
      viewerDeps: {
        startViewer: (dbPath) => {
          calledWith.push(dbPath)
          return { url: 'http://localhost:1234', close: () => undefined }
        },
      },
    }))
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(calledWith).toHaveLength(1)
  })

  it('outputs the URL returned by startViewer', () => {
    const result = runWorkflow(['view'], makeDeps({
      viewerDeps: {
        startViewer: (_dbPath) => ({ url: 'http://localhost:5678', close: () => undefined }),
      },
    }))
    expect(result.output).toStrictEqual('http://localhost:5678')
  })
})

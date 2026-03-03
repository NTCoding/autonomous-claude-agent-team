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

function makeViewerDeps(overrides?: Partial<ViewerDeps>): ViewerDeps {
  return {
    openViewer: () => '/tmp/workflow-viewer.html',
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

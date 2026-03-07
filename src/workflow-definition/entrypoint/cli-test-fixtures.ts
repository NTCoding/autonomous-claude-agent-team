import type { WorkflowEntrypointDeps } from './entrypoint.js'
import type { WorkflowEngineDeps, WorkflowEventStore } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowDeps } from '../index.js'
import type { WorkflowEvent } from '../index.js'

const AT = '2026-01-01T00:00:00Z'

export function makeHookStdin(overrides: Record<string, unknown> = {}): string {
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

export function spawnReadyEvents(): readonly WorkflowEvent[] {
  return [
    { type: 'issue-recorded', at: AT, issueNumber: 42 },
    { type: 'agent-registered', at: AT, agentType: 'developer-1', agentId: 'agt-1' },
    { type: 'agent-registered', at: AT, agentType: 'reviewer-1', agentId: 'agt-2' },
  ]
}

export function planningEvents(): readonly WorkflowEvent[] {
  return [
    ...spawnReadyEvents(),
    { type: 'transitioned', at: AT, from: 'SPAWN', to: 'PLANNING' },
  ]
}

export function developingEvents(): readonly WorkflowEvent[] {
  return [
    ...planningEvents(),
    { type: 'iteration-task-assigned', at: AT, task: 'Build the thing' },
    { type: 'transitioned', at: AT, from: 'PLANNING', to: 'RESPAWN', iteration: 0 },
    { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING', iteration: 0, developingHeadCommit: 'abc123' },
  ]
}

export function reviewingEvents(): readonly WorkflowEvent[] {
  return [
    ...developingEvents(),
    { type: 'developer-done-signaled', at: AT },
    { type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'REVIEWING' },
  ]
}

export function committingEvents(): readonly WorkflowEvent[] {
  return [
    ...reviewingEvents(),
    { type: 'review-approved', at: AT },
    { type: 'transitioned', at: AT, from: 'REVIEWING', to: 'COMMITTING' },
  ]
}

export function crReviewEvents(): readonly WorkflowEvent[] {
  return [
    ...committingEvents(),
    { type: 'pr-created', at: AT, prNumber: 99 },
    { type: 'transitioned', at: AT, from: 'COMMITTING', to: 'CR_REVIEW' },
  ]
}

export function prCreationEvents(): readonly WorkflowEvent[] {
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
    transcriptReader: { readMessages: () => [] },
    ...rest,
  }
}

function makeWorkflowDeps(overrides?: Partial<WorkflowDeps>): WorkflowDeps {
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
    ...overrides,
  }
}

export type MakeDepsOverrides = {
  engineDeps?: EngineDepsOverrides
  workflowDeps?: Partial<WorkflowDeps>
  getSessionId?: () => string
  readStdin?: () => string
}

export function makeDeps(overrides?: MakeDepsOverrides): WorkflowEntrypointDeps {
  return {
    getSessionId: overrides?.getSessionId ?? (() => 'test-session'),
    getRepositoryName: () => undefined,
    readStdin: overrides?.readStdin ?? (() => makeHookStdin()),
    engineDeps: makeEngineDeps(overrides?.engineDeps),
    workflowDeps: makeWorkflowDeps(overrides?.workflowDeps),
  }
}

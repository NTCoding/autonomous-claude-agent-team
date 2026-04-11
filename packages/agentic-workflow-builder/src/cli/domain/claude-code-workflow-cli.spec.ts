import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type { ClaudeCodeWorkflowCliConfig } from './claude-code-workflow-cli.js'
import { ClaudeCodeTranscriptReader } from '../../engine/index.js'
import type { RehydratableWorkflow, WorkflowDefinition, BaseWorkflowState, WorkflowEventStore } from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import { pass } from '../../dsl/index.js'
import type { ProcessDeps } from './workflow-cli.js'

vi.mock('./workflow-cli.js', () => ({
  createWorkflowCli: vi.fn(),
}))

const { createWorkflowCli } = await import('./workflow-cli.js')
const { createClaudeCodeWorkflowCli } = await import('./claude-code-workflow-cli.js')

type TestState = BaseWorkflowState
type TestDeps = Record<string, never>
type TestWorkflow = RehydratableWorkflow<TestState>

function createMockWorkflow(): TestWorkflow {
  return {
    getState: () => ({ currentStateMachineState: 'planning' }),
    appendEvent: () => undefined,
    getPendingEvents: () => [] as readonly BaseEvent[],
    startSession: () => undefined,
    getTranscriptPath: () => '/tmp/transcript.json',
    registerAgent: () => pass(),
    handleTeammateIdle: () => pass(),
  }
}

function createMockWorkflowDefinition(): WorkflowDefinition<TestWorkflow, TestState, TestDeps> {
  return {
    fold: (state) => state,
    buildWorkflow: () => createMockWorkflow(),
    stateSchema: z.string() as z.ZodType<string>,
    initialState: () => ({ currentStateMachineState: 'planning' }),
    getRegistry: () => ({
      planning: {
        emoji: '📋',
        agentInstructions: 'states/planning.md',
        canTransitionTo: [],
        allowedWorkflowOperations: [],
      },
    }),
    buildTransitionContext: (state, from, to) => ({
      state,
      gitInfo: {
        currentBranch: 'main',
        workingTreeClean: true,
        headCommit: 'abc',
        changedFilesVsDefault: [],
        hasCommitsVsDefault: false,
      },
      from,
      to,
    }),
  }
}

function createStubEventStore(): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => false,
    hasSessionStarted: () => false,
  }
}

function createStubProcessDeps(): ProcessDeps {
  return {
    getEnv: () => undefined,
    exit: () => undefined,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
    getArgv: () => [],
    readFile: () => '',
    appendToFile: () => undefined,
    buildStore: () => createStubEventStore(),
  }
}

describe('createClaudeCodeWorkflowCli', () => {
  it('delegates to createWorkflowCli with ClaudeCodeTranscriptReader injected', () => {
    const deps: TestDeps = {}
    const config: ClaudeCodeWorkflowCliConfig<TestWorkflow, TestState, TestDeps> = {
      workflowDefinition: createMockWorkflowDefinition(),
      routes: { init: { type: 'session-start', args: [] } },
      buildWorkflowDeps: () => deps,
      processDeps: createStubProcessDeps(),
    }

    createClaudeCodeWorkflowCli(config)

    const spy = vi.mocked(createWorkflowCli)
    expect(spy).toHaveBeenCalledOnce()
    const calledConfig = spy.mock.calls[0]?.[0]
    expect(calledConfig?.transcriptReader).toBeInstanceOf(ClaudeCodeTranscriptReader)
  })
})

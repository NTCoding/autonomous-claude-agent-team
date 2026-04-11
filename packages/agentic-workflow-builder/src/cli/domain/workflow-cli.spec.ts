import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createWorkflowCli } from './workflow-cli.js'
import type { WorkflowCliConfig, ProcessDeps } from './workflow-cli.js'
import type {
  WorkflowEventStore,
  RehydratableWorkflow,
  WorkflowDefinition,
  BaseWorkflowState,
} from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import { EXIT_ALLOW } from './exit-codes.js'
import { pass } from '../../dsl/index.js'
import type { PreconditionResult } from '../../dsl/index.js'

type TestState = { readonly currentStateMachineState: string } & BaseWorkflowState
type TestDeps = Record<string, never>

type TestWorkflow = RehydratableWorkflow<TestState> & {
  doSomething(): PreconditionResult
}

function createMockWorkflow(): TestWorkflow {
  const state: TestState = { currentStateMachineState: 'planning' }
  return {
    getState: () => state,
    getAgentInstructions: () => '/tmp/instructions.md',
    appendEvent: () => undefined,
    getPendingEvents: () => [] as readonly BaseEvent[],
    startSession: () => undefined,
    getTranscriptPath: () => '/tmp/transcript.json',
    registerAgent: () => pass(),
    handleTeammateIdle: () => pass(),
    doSomething: () => pass(),
  }
}

function createMockEventStore(hasSession = false): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => hasSession,
    hasSessionStarted: () => hasSession,
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

type TestContext = {
  readonly deps: ProcessDeps
  readonly capturedExitCode: () => number | undefined
  readonly capturedStdout: () => string
  readonly capturedStderr: () => string
  readonly capturedAppendedFiles: () => ReadonlyArray<{ path: string; content: string }>
}

function createTestProcessDeps(overrides?: Partial<ProcessDeps>): TestContext {
  let capturedExitCode: number | undefined
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const appendedFiles: Array<{ path: string; content: string }> = []

  const deps: ProcessDeps = {
    getEnv: (name) => {
      if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
      if (name === 'HOME') return '/tmp/home'
      return undefined
    },
    exit: (code) => { capturedExitCode = code },
    writeStdout: (s) => { stdoutChunks.push(s) },
    writeStderr: (s) => { stderrChunks.push(s) },
    getArgv: () => ['node', 'script.js'],
    readFile: () => '',
    appendToFile: (path, content) => { appendedFiles.push({ path, content }) },
    buildStore: () => createMockEventStore(),
    ...overrides,
  }

  return {
    deps,
    capturedExitCode: () => capturedExitCode,
    capturedStdout: () => stdoutChunks.join(''),
    capturedStderr: () => stderrChunks.join(''),
    capturedAppendedFiles: () => appendedFiles,
  }
}

function createBaseConfig(
  processDeps: ProcessDeps,
  overrides?: Partial<WorkflowCliConfig<TestWorkflow, TestState, TestDeps>>,
): WorkflowCliConfig<TestWorkflow, TestState, TestDeps> {
  return {
    workflowDefinition: createMockWorkflowDefinition(),
    routes: {
      init: {
        type: 'session-start',
        args: [],
      },
    },
    buildWorkflowDeps: () => ({} as TestDeps),
    transcriptReader: { readMessages: () => [] },
    processDeps,
    ...overrides,
  }
}

describe('createWorkflowCli', () => {
  describe('SessionStart hook', () => {
    it('succeeds without CLAUDE_SESSION_ID in env', () => {
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/tmp',
        hook_event_name: 'SessionStart',
      })
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js'],
        readFile: () => hookInput,
      })

      createWorkflowCli(createBaseConfig(ctx.deps))

      expect(ctx.capturedExitCode()).toBe(EXIT_ALLOW)
    })
  })

  describe('command routing', () => {
    it('routes session-start commands using CLAUDE_SESSION_ID from env', () => {
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'CLAUDE_SESSION_ID') return 'env-session'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js', 'init'],
      })

      createWorkflowCli(createBaseConfig(ctx.deps))

      expect(ctx.capturedExitCode()).toBe(EXIT_ALLOW)
    })
  })

  describe('custom router', () => {
    it('delegates to customRouter when it matches', () => {
      const ctx = createTestProcessDeps({
        getArgv: () => ['node', 'script.js', 'status'],
      })
      const config = createBaseConfig(ctx.deps, {
        customRouter: (command) => {
          if (command === 'status') return { output: 'all good', exitCode: EXIT_ALLOW }
          return undefined
        },
      })

      createWorkflowCli(config)

      expect(ctx.capturedExitCode()).toBe(EXIT_ALLOW)
      expect(ctx.capturedStdout()).toBe('all good')
    })

    it('falls through to runner when customRouter returns undefined', () => {
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/tmp',
        hook_event_name: 'SessionStart',
      })
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js'],
        readFile: () => hookInput,
      })
      const config = createBaseConfig(ctx.deps, {
        customRouter: () => undefined,
      })

      createWorkflowCli(config)

      expect(ctx.capturedExitCode()).toBe(EXIT_ALLOW)
    })
  })

  describe('platform context', () => {
    it('provides correct getPluginRoot and now to buildWorkflowDeps', () => {
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/tmp',
        hook_event_name: 'SessionStart',
      })
      let capturedPluginRoot: string | undefined
      let capturedNow: string | undefined
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js'],
        readFile: () => hookInput,
      })

      createWorkflowCli(createBaseConfig(ctx.deps, {
        buildWorkflowDeps: (platform) => {
          capturedPluginRoot = platform.getPluginRoot()
          capturedNow = platform.now()
          return {} as TestDeps
        },
      }))

      expect(capturedPluginRoot).toBe('/tmp/plugin')
      expect(capturedNow).toMatch(/^\d{4}-\d{2}-\d{2}/)
    })
  })

  describe('error handling', () => {
    it('throws when CLAUDE_PLUGIN_ROOT is missing', () => {
      const ctx = createTestProcessDeps({
        getEnv: () => undefined,
      })

      expect(() => createWorkflowCli(createBaseConfig(ctx.deps))).toThrow(
        'Missing required environment variable: CLAUDE_PLUGIN_ROOT',
      )
    })

    it('writes error to stderr and error log, exits 1 when runner throws', () => {
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js'],
        readFile: () => { throw new Error('stdin unavailable') },
      })

      createWorkflowCli(createBaseConfig(ctx.deps))

      expect(ctx.capturedExitCode()).toBe(1)
      expect(ctx.capturedStderr()).toContain('stdin unavailable')
      expect(ctx.capturedAppendedFiles().some((f) => f.path === '/tmp/plugin/error.log')).toBe(true)
    })

    it('silently ignores error log write failure', () => {
      const ctx = createTestProcessDeps({
        getEnv: (name) => {
          if (name === 'CLAUDE_PLUGIN_ROOT') return '/tmp/plugin'
          if (name === 'HOME') return '/tmp/home'
          return undefined
        },
        getArgv: () => ['node', 'script.js'],
        readFile: () => { throw new Error('stdin unavailable') },
        appendToFile: () => { throw new Error('disk full') },
      })

      createWorkflowCli(createBaseConfig(ctx.deps))

      expect(ctx.capturedExitCode()).toBe(1)
      expect(ctx.capturedStderr()).toContain('stdin unavailable')
    })
  })
})

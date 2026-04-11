import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createWorkflowRunner } from './workflow-runner.js'
import type { WorkflowRunnerConfig } from './workflow-runner.js'
import { pass, fail } from '../../dsl/index.js'
import type { PreconditionResult } from '../../dsl/index.js'
import type {
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEngineDeps,
  WorkflowEventStore,
} from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import { arg } from './arg-helpers.js'
import { EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from './exit-codes.js'

type TestState = { currentStateMachineState: string }
type TestDeps = Record<string, never>

type TestWorkflow = RehydratableWorkflow<TestState> & {
  doSomething(): PreconditionResult
}

function createMockWorkflow(initialState: TestState = { currentStateMachineState: 'planning' }): TestWorkflow {
  let state = initialState
  const pending: BaseEvent[] = []
  let transcriptPath = '/tmp/transcript.json'
  return {
    getState: () => state,
    getAgentInstructions: () => '/tmp/instructions.md',
    appendEvent: (event: BaseEvent) => {
      pending.push(event)
      if (event.type === 'transitioned') {
        const e = event as BaseEvent & { to: string }
        state = { ...state, currentStateMachineState: e.to }
      }
    },
    getPendingEvents: () => pending,
    startSession: (nextTranscriptPath: string) => {
      transcriptPath = nextTranscriptPath
      pending.push({ type: 'session-started', at: '2024-01-01T00:00:00Z', transcriptPath: nextTranscriptPath })
    },
    getTranscriptPath: () => transcriptPath,
    registerAgent: () => pass(),
    handleTeammateIdle: () => pass(),
    doSomething: () => pass(),
  }
}

function createMockStore(hasSession = false): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => hasSession,
    hasSessionStarted: () => hasSession,
  }
}

function createMockEngineDeps(hasSession = false): WorkflowEngineDeps {
  return {
    store: createMockStore(hasSession),
    getPluginRoot: () => '/tmp/plugin',
    getEnvFilePath: () => '/tmp/.env',
    readFile: () => '# Procedure content',
    appendToFile: () => undefined,
    now: () => '2024-01-01T00:00:00Z',
    transcriptReader: { readMessages: () => [] },
  }
}

function createMockFactory(): WorkflowDefinition<TestWorkflow, TestState, TestDeps> {
  return {
    fold: (_state: TestState, _event: BaseEvent): TestState => ({ currentStateMachineState: 'planning' }),
    buildWorkflow: (state: TestState, _deps: TestDeps): TestWorkflow => createMockWorkflow(state),
    stateSchema: z.string() as z.ZodType<string>,
    initialState: () => ({ currentStateMachineState: 'planning' }),
    getRegistry: () => ({
      planning: {
        emoji: '📋',
        agentInstructions: 'states/planning.md',
        canTransitionTo: ['coding'],
        allowedWorkflowOperations: [],
      },
      coding: {
        emoji: '💻',
        agentInstructions: 'states/coding.md',
        canTransitionTo: [],
        allowedWorkflowOperations: [],
      },
    }),
    buildTransitionContext: (state, from, to, _deps) => ({
      state,
      gitInfo: { currentBranch: 'main', workingTreeClean: true, headCommit: 'abc', changedFilesVsDefault: [], hasCommitsVsDefault: false },
      prChecksPass: false,
      from,
      to,
    }),
    getOperationBody: (op: string) => `Body for ${op}`,
    getTransitionTitle: (to: string) => `Transitioned to ${to}`,
  }
}

function createTestConfig(overrides?: Partial<WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps>>): WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps> {
  return {
    workflowDefinition: createMockFactory(),
    routes: {
      init: {
        type: 'session-start',
        args: [arg.string('session-id')],
      },
      transition: {
        type: 'transition',
        args: [arg.string('session-id'), arg.string('target')],
      },
      'do-something': {
        type: 'transaction',
        args: [arg.string('session-id')],
        handler: (w: TestWorkflow) => w.doSomething(),
      },
      'no-extra-args': {
        type: 'transaction',
        args: [arg.string('session-id')],
        handler: () => pass(),
      },
    },
    ...overrides,
  }
}

describe('createWorkflowRunner', () => {
  describe('command routing', () => {
    it('routes session-start commands to engine.startSession', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner(['init', 'session-1'], createMockEngineDeps(), {})
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('routes transition commands to engine.transition', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['transition', 'session-1', 'coding'], deps, {})
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(result.output).toContain('Transitioned to coding')
    })

    it('routes transaction commands to engine.transaction', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['do-something', 'session-1'], deps, {})
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns error for unknown commands', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner(['unknown-cmd'], createMockEngineDeps(), {})
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toBe('Unknown command: unknown-cmd')
    })

    it('returns error when arg parsing fails', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner(['init'], createMockEngineDeps(), {})
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toBe('init: missing required argument <session-id>')
    })

    it('handles transaction commands with only session-id arg', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['no-extra-args', 'session-1'], deps, {})
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('uses getSessionId from options instead of parsing session-id arg', () => {
      const config: WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps> = {
        workflowDefinition: createMockFactory(),
        routes: {
          'do-something': {
            type: 'transaction',
            args: [],
            handler: (w: TestWorkflow) => w.doSomething(),
          },
        },
      }
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['do-something'], deps, {}, { getSessionId: () => 'injected-session' })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('uses getSessionId for transition commands without session-id arg', () => {
      const config: WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps> = {
        workflowDefinition: createMockFactory(),
        routes: {
          transition: {
            type: 'transition',
            args: [arg.string('target')],
          },
        },
      }
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['transition', 'coding'], deps, {}, { getSessionId: () => 'injected-session' })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(result.output).toContain('Transitioned to coding')
    })

    it('uses getSessionId for session-start commands without session-id arg', () => {
      const config: WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps> = {
        workflowDefinition: createMockFactory(),
        routes: {
          init: {
            type: 'session-start',
            args: [],
          },
        },
      }
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps()
      const result = runner(['init'], deps, {}, { getSessionId: () => 'injected-session' })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('uses getSessionTranscriptPath for session-start commands', () => {
      const appended: BaseEvent[][] = []
      const config: WorkflowRunnerConfig<TestWorkflow, TestState, TestDeps> = {
        workflowDefinition: createMockFactory(),
        routes: {
          init: {
            type: 'session-start',
            args: [],
          },
        },
      }
      const runner = createWorkflowRunner(config)
      const deps: WorkflowEngineDeps = {
        ...createMockEngineDeps(false),
        store: {
          ...createMockStore(false),
          appendEvents: (_sessionId, events) => {
            appended.push([...events])
          },
        },
      }

      const result = runner(
        ['init'],
        deps,
        {},
        {
          getSessionId: () => 'session-with-transcript',
          getSessionTranscriptPath: () => '/tmp/opencode.db',
        },
      )

      expect(result.exitCode).toBe(EXIT_ALLOW)
      const sessionStarted = appended.flat().find((event) => event.type === 'session-started')
      expect(sessionStarted?.['transcriptPath']).toBe('/tmp/opencode.db')
    })
  })

  describe('engine result mapping', () => {
    it('maps blocked engine result to EXIT_BLOCK', () => {
      const factory = createMockFactory()
      factory.buildWorkflow = (_state: TestState, _deps: TestDeps): TestWorkflow => ({
        ...createMockWorkflow(),
        doSomething: () => fail('not allowed'),
      })
      const config = createTestConfig({ workflowDefinition: factory })
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['do-something', 'session-1'], deps, {})
      expect(result.exitCode).toBe(EXIT_BLOCK)
    })

    it('maps blocked transition to EXIT_BLOCK', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const deps = createMockEngineDeps(true)
      const result = runner(['transition', 'session-1', 'invalid-state'], deps, {})
      expect(result.exitCode).toBe(EXIT_BLOCK)
    })
  })

  describe('hook mode (no command)', () => {
    it('returns error when no command and no stdin', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner([], createMockEngineDeps(), {})
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toBe('No command and no stdin available')
    })

    it('handles SessionStart hook event', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
      })
      const appendedFiles: string[] = []
      const deps: WorkflowEngineDeps = {
        ...createMockEngineDeps(),
        appendToFile: (path: string) => { appendedFiles.push(path) },
      }
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(appendedFiles).toContain('/tmp/.env')
    })

    it('returns allow for PreToolUse with no handler configured', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns allow for PreToolUse when session does not exist', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'no-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(false)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns allow for unknown hook events', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'UnknownEvent',
      })
      const result = runner([], createMockEngineDeps(true), {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(result.output).toBe('')
    })

    it('returns error for invalid hook input JSON', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner([], createMockEngineDeps(), {}, { readStdin: () => '{}' })
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toContain('Invalid hook input')
    })

    it('returns error for invalid pre-tool-use input', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toContain('Invalid pre-tool-use input')
    })

    it('dispatches to preToolUseHandler when configured', () => {
      const config = createTestConfig({
        preToolUseHandler: (_engine, _sessionId, toolName, toolInput) => {
          if (toolName === 'Bash' && toolInput['command'] === 'ls') {
            return { type: 'success', output: '' }
          }
          return { type: 'blocked', output: 'Denied by handler' }
        },
      })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('wraps preToolUseHandler blocked result with formatDenyDecision', () => {
      const config = createTestConfig({
        preToolUseHandler: () => ({ type: 'blocked', output: 'Not permitted' }),
      })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/some/file.ts' },
        tool_use_id: 'tool-2',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_BLOCK)
      const parsed = JSON.parse(result.output)
      expect(parsed).toStrictEqual({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'Not permitted',
        },
      })
    })

    it('skips preToolUseHandler when session does not exist', () => {
      let handlerCalled = false
      const config = createTestConfig({
        preToolUseHandler: () => {
          handlerCalled = true
          return { type: 'success', output: '' }
        },
      })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'no-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(false)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(handlerCalled).toBe(false)
    })

    it('dispatches SubagentStart to workflow.registerAgent directly', () => {
      const registered: Array<{ agentType: string; agentId: string }> = []
      const factory = createMockFactory()
      factory.buildWorkflow = (state: TestState, _deps: TestDeps): TestWorkflow => ({
        ...createMockWorkflow(state),
        registerAgent: (agentType, agentId) => {
          registered.push({ agentType, agentId })
          return pass()
        },
      })
      const config = createTestConfig({ workflowDefinition: factory })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'SubagentStart',
        agent_id: 'agt-1',
        agent_type: 'developer-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(registered[0]).toEqual({ agentType: 'developer-1', agentId: 'agt-1' })
      const parsed = JSON.parse(result.output)
      expect(parsed).toHaveProperty('additionalContext')
    })

    it('returns allow for SubagentStart when session does not exist', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'no-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'SubagentStart',
        agent_id: 'agt-1',
        agent_type: 'developer-1',
      })
      const deps = createMockEngineDeps(false)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('dispatches TeammateIdle to workflow.handleTeammateIdle that allows', () => {
      const factory = createMockFactory()
      factory.buildWorkflow = (state: TestState, _deps: TestDeps): TestWorkflow => ({
        ...createMockWorkflow(state),
        handleTeammateIdle: (agentName) => {
          if (agentName.includes('lead')) return fail('Lead cannot go idle')
          return pass()
        },
      })
      const config = createTestConfig({ workflowDefinition: factory })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'TeammateIdle',
        teammate_name: 'developer-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('dispatches TeammateIdle to workflow.handleTeammateIdle that blocks', () => {
      const factory = createMockFactory()
      factory.buildWorkflow = (state: TestState, _deps: TestDeps): TestWorkflow => ({
        ...createMockWorkflow(state),
        handleTeammateIdle: (agentName) => {
          if (agentName.includes('lead')) return fail('Lead cannot go idle')
          return pass()
        },
      })
      const config = createTestConfig({ workflowDefinition: factory })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'TeammateIdle',
        teammate_name: 'lead-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_BLOCK)
    })

    it('returns allow for TeammateIdle when session does not exist', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'no-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'TeammateIdle',
      })
      const deps = createMockEngineDeps(false)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns error for invalid subagent-start input', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'SubagentStart',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toContain('Invalid subagent-start input')
    })

    it('returns error for invalid teammate-idle input', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'TeammateIdle',
        teammate_name: 42,
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toContain('Invalid teammate-idle input')
    })

    it('handles TeammateIdle with missing teammate_name', () => {
      const receivedNames: string[] = []
      const factory = createMockFactory()
      factory.buildWorkflow = (state: TestState, _deps: TestDeps): TestWorkflow => ({
        ...createMockWorkflow(state),
        handleTeammateIdle: (agentName) => {
          receivedNames.push(agentName)
          return pass()
        },
      })
      const config = createTestConfig({ workflowDefinition: factory })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'TeammateIdle',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(receivedNames[0]).toBe('')
    })
  })

  describe('preToolUse policy resolution', () => {
    const BASH_FORBIDDEN = { commands: ['rm -rf /'], flags: [] as string[] }
    const ALLOW_WRITE = (): boolean => true

    it('throws when preToolUseHandler and policy fields are both provided', () => {
      expect(() => createWorkflowRunner(createTestConfig({
        preToolUseHandler: () => ({ type: 'success', output: '' }),
        bashForbidden: BASH_FORBIDDEN,
      }))).toThrow(/mutually exclusive/)
    })

    it('throws when customGates is set without bashForbidden and isWriteAllowed', () => {
      expect(() => createWorkflowRunner(createTestConfig({
        customGates: [{ name: 'g', check: () => true }],
      }))).toThrow(/customGates requires bashForbidden and isWriteAllowed/)
    })

    it('throws when bashForbidden is set without isWriteAllowed', () => {
      expect(() => createWorkflowRunner(createTestConfig({
        bashForbidden: BASH_FORBIDDEN,
      }))).toThrow(/must be provided together/)
    })

    it('throws when isWriteAllowed is set without bashForbidden', () => {
      expect(() => createWorkflowRunner(createTestConfig({
        isWriteAllowed: ALLOW_WRITE,
      }))).toThrow(/must be provided together/)
    })

    it('builds default handler from bashForbidden + isWriteAllowed', () => {
      const config = createTestConfig({
        bashForbidden: BASH_FORBIDDEN,
        isWriteAllowed: ALLOW_WRITE,
      })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_BLOCK)
    })

    it('builds default handler with customGates', () => {
      const gateCalls: string[] = []
      const config = createTestConfig({
        bashForbidden: BASH_FORBIDDEN,
        isWriteAllowed: ALLOW_WRITE,
        customGates: [
          {
            name: 'record',
            check: (_w, { toolName }) => {
              gateCalls.push(toolName)
              return true
            },
          },
        ],
      })
      const runner = createWorkflowRunner(config)
      const hookInput = JSON.stringify({
        session_id: 'hook-session',
        transcript_path: '/tmp/transcript.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_use_id: 'tool-1',
      })
      const deps = createMockEngineDeps(true)
      const result = runner([], deps, {}, { readStdin: () => hookInput })
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(gateCalls).toEqual(['Bash'])
    })
  })
})

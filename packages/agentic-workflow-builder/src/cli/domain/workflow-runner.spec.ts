import { describe, it, expect } from 'vitest'
import { createWorkflowRunner } from './workflow-runner.js'
import type { WorkflowCliConfig } from './workflow-runner.js'
import { pass, fail } from '../../dsl/index.js'
import type { PreconditionResult } from '../../dsl/index.js'
import type {
  RehydratableWorkflow,
  WorkflowFactory,
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
    startSession: () => undefined,
    doSomething: () => pass(),
  }
}

function createMockStore(hasSession = false): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => hasSession,
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
  }
}

function createMockFactory(): WorkflowFactory<TestWorkflow, TestState, TestDeps> {
  return {
    rehydrate: (_events: readonly BaseEvent[]) => createMockWorkflow(),
    createFresh: () => createMockWorkflow(),
    procedurePath: () => '/tmp/procedure.md',
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
    parseStateName: (v: string) => v,
  }
}

function createTestConfig(overrides?: Partial<WorkflowCliConfig<TestWorkflow, TestState, TestDeps>>): WorkflowCliConfig<TestWorkflow, TestState, TestDeps> {
  return {
    factory: createMockFactory(),
    commands: {
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
  })

  describe('engine result mapping', () => {
    it('maps blocked engine result to EXIT_BLOCK', () => {
      const factory = createMockFactory()
      factory.rehydrate = () => ({
        ...createMockWorkflow(),
        doSomething: () => fail('not allowed'),
      })
      const config = createTestConfig({ factory })
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
      const result = runner([], deps, {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(appendedFiles).toContain('/tmp/.env')
    })

    it('handles PreToolUse hook with matching tool check', () => {
      const config = createTestConfig({
        hooks: {
          preToolUse: {
            Bash: {
              extract: (toolInput) => ({ command: String(toolInput['command'] ?? '') }),
              check: (_w, extracted) => {
                if (extracted['command'] === 'rm -rf /') return fail('Dangerous command')
                return pass()
              },
            },
          },
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
      const result = runner([], deps, {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns allow for PreToolUse with no hooks configured', () => {
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
      const result = runner([], deps, {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns allow for PreToolUse with no matching tool check', () => {
      const config = createTestConfig({
        hooks: {
          preToolUse: {
            Write: {
              extract: () => ({}),
              check: () => pass(),
            },
          },
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
      const result = runner([], deps, {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ALLOW)
    })

    it('returns allow for PreToolUse when session does not exist', () => {
      const config = createTestConfig({
        hooks: {
          preToolUse: {
            Bash: {
              extract: () => ({}),
              check: () => fail('should not reach'),
            },
          },
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
      const result = runner([], deps, {}, () => hookInput)
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
      const result = runner([], createMockEngineDeps(), {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ALLOW)
      expect(result.output).toBe('')
    })

    it('returns error for invalid hook input JSON', () => {
      const config = createTestConfig()
      const runner = createWorkflowRunner(config)
      const result = runner([], createMockEngineDeps(), {}, () => '{}')
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
      const result = runner([], createMockEngineDeps(), {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_ERROR)
      expect(result.output).toContain('Invalid pre-tool-use input')
    })

    it('handles PreToolUse hook that blocks', () => {
      const config = createTestConfig({
        hooks: {
          preToolUse: {
            Bash: {
              extract: (toolInput) => ({ command: String(toolInput['command'] ?? '') }),
              check: () => fail('Blocked by hook'),
            },
          },
        },
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
      const result = runner([], deps, {}, () => hookInput)
      expect(result.exitCode).toBe(EXIT_BLOCK)
    })
  })
})

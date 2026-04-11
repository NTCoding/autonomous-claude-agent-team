import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createPreToolUseHandler } from './pre-tool-use-handler.js'
import type { CustomPreToolUseGate } from './pre-tool-use-handler.js'
import { WorkflowEngine } from '../../engine/index.js'
import type {
  BaseWorkflowState,
  EngineResult,
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import type { BashForbiddenConfig, WorkflowRegistry } from '../../dsl/index.js'
import { pass } from '../../dsl/index.js'

type StubStateName = 'DEVELOPING'
type StubState = BaseWorkflowState<StubStateName>
type StubDeps = Record<string, never>

type EngineCall =
  | { readonly method: 'transaction'; readonly op: string }
  | { readonly method: 'checkWrite'; readonly toolName: string; readonly filePath: string }
  | { readonly method: 'checkBash'; readonly toolName: string; readonly command: string }

type StubWorkflowType = RehydratableWorkflow<StubState>

class StubWorkflow implements StubWorkflowType {
  getState(): StubState { return { currentStateMachineState: 'DEVELOPING' } }
  getAgentInstructions(): string { return '' }
  appendEvent(): void { /* noop */ }
  getPendingEvents(): readonly BaseEvent[] { return [] }
  startSession(): void { /* noop */ }
  getTranscriptPath(): string { return '/tmp/transcript.json' }
  registerAgent(): { pass: true } { return { pass: true } }
  handleTeammateIdle(): { pass: true } { return { pass: true } }
}

const STUB_REGISTRY: WorkflowRegistry<StubState, StubStateName, string> = {
  DEVELOPING: {
    emoji: '⚡',
    agentInstructions: 'states/developing.md',
    canTransitionTo: [],
    allowedWorkflowOperations: [],
  },
}

function makeStubFactory(): WorkflowDefinition<StubWorkflowType, StubState, StubDeps, StubStateName, string> {
  return {
    fold: () => ({ currentStateMachineState: 'DEVELOPING' }),
    buildWorkflow: () => new StubWorkflow(),
    stateSchema: z.string() as z.ZodType<string>,
    initialState: () => ({ currentStateMachineState: 'DEVELOPING' }),
    getRegistry: () => STUB_REGISTRY,
    buildTransitionContext: (state, from, to) => ({
      state,
      gitInfo: { currentBranch: 'main', workingTreeClean: true, headCommit: 'abc', changedFilesVsDefault: [], hasCommitsVsDefault: false },
      prChecksPass: false,
      from,
      to,
    }),
  }
}

function makeStubStore(): WorkflowEventStore {
  return {
    readEvents: () => [],
    appendEvents: () => undefined,
    sessionExists: () => true,
  }
}

function makeStubEngineDeps(): WorkflowEngineDeps {
  return {
    store: makeStubStore(),
    getPluginRoot: () => '/plugin',
    getEnvFilePath: () => '/test/claude.env',
    readFile: () => '',
    appendToFile: () => undefined,
    now: () => '2026-01-01T00:00:00Z',
    transcriptReader: { readMessages: () => [] },
  }
}

type RealEngine = WorkflowEngine<StubWorkflowType, StubState, StubDeps, StubStateName, string>

function makeSpyEngine(
  responses: {
    transaction?: (op: string) => EngineResult
    checkWrite?: (toolName: string, filePath: string) => EngineResult
    checkBash?: (toolName: string, command: string) => EngineResult
  } = {},
): { engine: RealEngine; calls: EngineCall[] } {
  const calls: EngineCall[] = []
  const real = new WorkflowEngine(makeStubFactory(), makeStubEngineDeps(), {} as StubDeps)
  const spied = real as unknown as {
    transaction: (sessionId: string, op: string, fn: unknown) => EngineResult
    checkWrite: (sessionId: string, toolName: string, filePath: string, predicate: unknown) => EngineResult
    checkBash: (sessionId: string, toolName: string, command: string, forbidden: unknown) => EngineResult
  }
  spied.transaction = (_sessionId, op, _fn) => {
    calls.push({ method: 'transaction', op })
    return responses.transaction?.(op) ?? { type: 'success', output: '' }
  }
  spied.checkWrite = (_sessionId, toolName, filePath, _predicate) => {
    calls.push({ method: 'checkWrite', toolName, filePath })
    return responses.checkWrite?.(toolName, filePath) ?? { type: 'success', output: '' }
  }
  spied.checkBash = (_sessionId, toolName, command, _forbidden) => {
    calls.push({ method: 'checkBash', toolName, command })
    return responses.checkBash?.(toolName, command) ?? { type: 'success', output: '' }
  }
  return { engine: real, calls }
}

const NOOP_BASH_FORBIDDEN: BashForbiddenConfig = { commands: [], flags: [] }
const ALWAYS_ALLOW_WRITE = (): boolean => true

describe('createPreToolUseHandler', () => {
  it('returns success when all checks pass', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    const result = handler(engine, 'sess1', 'Bash', { command: 'ls' })
    expect(result.type).toStrictEqual('success')
    expect(calls.some((c) => c.method === 'checkWrite')).toStrictEqual(true)
    expect(calls.some((c) => c.method === 'checkBash')).toStrictEqual(true)
  })

  it('blocks when first custom gate fails and skips later checks', () => {
    const { engine, calls } = makeSpyEngine({
      transaction: (op) => op === 'hook:plugin-source-read' ? { type: 'blocked', output: 'plugin source blocked' } : { type: 'success', output: '' },
    })
    const gate: CustomPreToolUseGate<StubWorkflowType, StubState, StubStateName> = {
      name: 'plugin-source-read',
      check: () => 'plugin source blocked',
    }
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
      customGates: [gate],
    })
    const result = handler(engine, 'sess1', 'Read', { file_path: '/plugin/src/internal.ts' })
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('plugin source blocked')
    expect(calls.filter((c) => c.method === 'checkWrite')).toHaveLength(0)
    expect(calls.filter((c) => c.method === 'checkBash')).toHaveLength(0)
  })

  it('runs custom gates in order and first blocker wins', () => {
    const { engine, calls } = makeSpyEngine({
      transaction: (op) => op === 'hook:gate-b' ? { type: 'blocked', output: 'B blocked' } : { type: 'success', output: '' },
    })
    const gateA: CustomPreToolUseGate<StubWorkflowType, StubState, StubStateName> = {
      name: 'gate-a',
      check: () => true,
    }
    const gateB: CustomPreToolUseGate<StubWorkflowType, StubState, StubStateName> = {
      name: 'gate-b',
      check: () => 'B blocked',
    }
    const gateC: CustomPreToolUseGate<StubWorkflowType, StubState, StubStateName> = {
      name: 'gate-c',
      check: () => 'should not run',
    }
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
      customGates: [gateA, gateB, gateC],
    })
    const result = handler(engine, 'sess1', 'Read', {})
    expect(result.type).toStrictEqual('blocked')
    const transactionOps = calls.filter((c): c is EngineCall & { method: 'transaction' } => c.method === 'transaction').map((c) => c.op)
    expect(transactionOps).toStrictEqual(['hook:gate-a', 'hook:gate-b'])
  })

  it('runs writeCheck and checkBash when no customGates configured', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Bash', { command: 'ls' })
    expect(calls.filter((c) => c.method === 'checkWrite')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'checkBash')).toHaveLength(1)
  })

  it('blocks when writeCheck fails and skips bash check', () => {
    const { engine, calls } = makeSpyEngine({
      checkWrite: () => ({ type: 'blocked', output: 'write forbidden' }),
    })
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    const result = handler(engine, 'sess1', 'Write', { file_path: '/x.ts' })
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('write forbidden')
    expect(calls.filter((c) => c.method === 'checkBash')).toHaveLength(0)
  })

  it('reaches checkBash when prior checks pass', () => {
    const { engine, calls } = makeSpyEngine({
      checkBash: () => ({ type: 'blocked', output: 'bash forbidden' }),
    })
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    const result = handler(engine, 'sess1', 'Bash', { command: 'rm -rf /' })
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('bash forbidden')
    expect(calls.filter((c) => c.method === 'checkBash')).toHaveLength(1)
  })

  it('extracts filePath from file_path field with highest priority', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Write', { file_path: '/a.ts', path: '/b.ts', pattern: '*.ts' })
    const writeCall = calls.find((c): c is EngineCall & { method: 'checkWrite' } => c.method === 'checkWrite')
    expect(writeCall?.filePath).toStrictEqual('/a.ts')
  })

  it('extracts filePath from path field when file_path absent', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Glob', { path: '/b.ts', pattern: '*.ts' })
    const writeCall = calls.find((c): c is EngineCall & { method: 'checkWrite' } => c.method === 'checkWrite')
    expect(writeCall?.filePath).toStrictEqual('/b.ts')
  })

  it('extracts filePath from pattern field when file_path and path absent', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Grep', { pattern: '*.ts' })
    const writeCall = calls.find((c): c is EngineCall & { method: 'checkWrite' } => c.method === 'checkWrite')
    expect(writeCall?.filePath).toStrictEqual('*.ts')
  })

  it('extracts command from command field', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Bash', { command: 'pnpm test' })
    const bashCall = calls.find((c): c is EngineCall & { method: 'checkBash' } => c.method === 'checkBash')
    expect(bashCall?.command).toStrictEqual('pnpm test')
  })

  it('throws when tool_input contains a non-string value', () => {
    const { engine } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    expect(() => handler(engine, 'sess1', 'Write', { file_path: 42 }))
      .toThrow('Expected string or undefined')
  })

  it('treats null and undefined fields as empty strings', () => {
    const { engine, calls } = makeSpyEngine()
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
    })
    handler(engine, 'sess1', 'Read', { file_path: null, path: undefined, pattern: undefined, command: null })
    const writeCall = calls.find((c): c is EngineCall & { method: 'checkWrite' } => c.method === 'checkWrite')
    const bashCall = calls.find((c): c is EngineCall & { method: 'checkBash' } => c.method === 'checkBash')
    expect(writeCall?.filePath).toStrictEqual('')
    expect(bashCall?.command).toStrictEqual('')
  })

  it('uses op name hook:<gate-name> for each custom gate transaction', () => {
    const { engine, calls } = makeSpyEngine()
    const gate: CustomPreToolUseGate<StubWorkflowType, StubState, StubStateName> = {
      name: 'my-gate',
      check: () => true,
    }
    const handler = createPreToolUseHandler<StubWorkflowType, StubState, StubDeps, StubStateName, string>({
      bashForbidden: NOOP_BASH_FORBIDDEN,
      isWriteAllowed: ALWAYS_ALLOW_WRITE,
      customGates: [gate],
    })
    handler(engine, 'sess1', 'Read', {})
    const transactionCall = calls.find((c): c is EngineCall & { method: 'transaction' } => c.method === 'transaction')
    expect(transactionCall?.op).toStrictEqual('hook:my-gate')
  })
})

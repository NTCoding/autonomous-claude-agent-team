import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { WorkflowEngine } from './workflow-engine.js'
import type {
  RehydratableWorkflow,
  WorkflowFactory,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from './workflow-engine.js'
import type { BaseWorkflowState } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import type { PreconditionResult } from '../../dsl/index.js'
import { pass, fail } from '../../dsl/index.js'
import type { TranscriptReader } from './transcript-reader.js'
import type { TranscriptMessage } from './transcript-reader.js'
import type { PrefixConfig } from './identity-verification.js'

type TestState = BaseWorkflowState & { readonly iteration: number }
type TestDeps = { readonly pluginRoot: string }

const INITIAL_STATE: TestState = {
  currentStateMachineState: 'SPAWN',
  iteration: 0,
}

class StubWorkflow implements RehydratableWorkflow<TestState> {
  private state: TestState
  private pending: BaseEvent[] = []

  constructor(state: TestState) {
    this.state = { ...state }
  }

  getState(): TestState {
    return this.state
  }

  getAgentInstructions(_pluginRoot: string): string {
    return '/plugin/states/spawn.md'
  }

  transitionTo(target: string): PreconditionResult {
    const event: BaseEvent = { type: 'transitioned', at: '2026-01-01T00:00:00.000Z' }
    this.pending = [...this.pending, event]
    this.state = { ...this.state, currentStateMachineState: target }
    return pass()
  }

  getPendingEvents(): readonly BaseEvent[] {
    return this.pending
  }

  addPendingEvent(event: BaseEvent): void {
    this.pending = [...this.pending, event]
  }

  startSession(transcriptPath: string | undefined, repository: string | undefined): void {
    const event: BaseEvent = {
      type: 'session-started',
      at: '2026-01-01T00:00:00.000Z',
      ...(transcriptPath === undefined ? {} : { transcriptPath }),
      ...(repository === undefined ? {} : { repository }),
    }
    this.pending = [...this.pending, event]
  }
}

class FailingWorkflow extends StubWorkflow {
  override transitionTo(_target: string): PreconditionResult {
    return fail('Guard failed: missing issue')
  }
}

function makeFactory(workflow?: StubWorkflow): WorkflowFactory<StubWorkflow, TestState, TestDeps> {
  return {
    rehydrate: (_events, _deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    createFresh: (_deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    procedurePath: (state, pluginRoot) => `${pluginRoot}/states/${state.toLowerCase()}.md`,
    initialState: () => INITIAL_STATE,
    getEmojiForState: (state) => state === 'SPAWN' ? '🟣' : '🔨',
    getOperationBody: (op, state) => `${op} completed for state ${state.currentStateMachineState}`,
    getTransitionTitle: (to, state) => to === 'RESPAWN' ? `RESPAWN (iteration: ${state.iteration})` : to,
  }
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
    readFile: () => '# Procedure\n\n- [ ] Do the thing',
    appendToFile: () => undefined,
    now: () => '2026-01-01T00:00:00.000Z',
    ...rest,
  }
}

function makeTestDeps(): TestDeps {
  return { pluginRoot: '/plugin' }
}

function makeEngine(
  engineOverrides?: EngineDepsOverrides,
  factoryWorkflow?: StubWorkflow,
): WorkflowEngine<StubWorkflow, TestState, TestDeps> {
  return new WorkflowEngine(
    makeFactory(factoryWorkflow),
    makeEngineDeps(engineOverrides),
    makeTestDeps(),
  )
}

function stubTranscriptReader(messages: readonly TranscriptMessage[]): TranscriptReader {
  return { readMessages: () => messages }
}

function makeEngineWithPrefixConfig(
  transcriptReader: TranscriptReader,
  prefixConfig: PrefixConfig,
  engineOverrides?: EngineDepsOverrides,
): WorkflowEngine<StubWorkflow, TestState, TestDeps> {
  const factory = { ...makeFactory(), getPrefixConfig: () => prefixConfig }
  return new WorkflowEngine(
    factory,
    makeEngineDeps({ ...engineOverrides, transcriptReader }),
    makeTestDeps(),
  )
}

describe('WorkflowEngine.startSession', () => {
  it('creates initial session-started event when no session exists', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: { sessionExists: () => false, appendEvents: (sessionId, events) => appended.push({ sessionId, events }) },
    })
    const result = engine.startSession('sess1', '/transcript.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Feature team initialized')
    expect(appended[0]?.events[0]?.type).toStrictEqual('session-started')
    expect(appended[0]?.events[0]).toMatchObject({ transcriptPath: '/transcript.jsonl' })
  })

  it('creates session-started event without transcriptPath when omitted', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: { sessionExists: () => false, appendEvents: (sessionId, events) => appended.push({ sessionId, events }) },
    })
    const result = engine.startSession('sess1')
    expect(result.type).toStrictEqual('success')
    expect(appended[0]?.events[0]).not.toMatchObject({ transcriptPath: expect.anything() })
  })

  it('persists session-started event with session id in SPAWN state', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: { sessionExists: () => false, appendEvents: (sessionId, events) => appended.push({ sessionId, events }) },
    })
    engine.startSession('sess1')
    expect(appended[0]?.sessionId).toStrictEqual('sess1')
    expect(appended[0]?.events[0]?.type).toStrictEqual('session-started')
  })

  it('forwards repository to session-started event', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: { sessionExists: () => false, appendEvents: (sessionId, events) => appended.push({ sessionId, events }) },
    })
    engine.startSession('sess1', undefined, 'owner/repo')
    expect(appended[0]?.events[0]).toMatchObject({ repository: 'owner/repo' })
  })

  it('returns empty output when session already exists', () => {
    const engine = makeEngine({ store: { sessionExists: () => true } })
    const result = engine.startSession('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toStrictEqual('')
  })
})

describe('WorkflowEngine.transaction', () => {
  it('executes operation, appends pending events when precondition passes', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    const engine = makeEngine(
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
      workflow,
    )
    const result = engine.transaction('sess1', 'record-issue', (w) => {
      w.addPendingEvent({ type: 'issue-recorded', at: '2026-01-01T00:00:00.000Z' })
      return pass()
    })
    expect(result.type).toStrictEqual('success')
    expect(appended[0]?.events[0]?.type).toStrictEqual('issue-recorded')
  })

  it('does not append events when precondition fails', () => {
    const appended: BaseEvent[] = []
    const engine = makeEngine({
      store: { appendEvents: (_id, events) => appended.push(...events) },
    })
    const result = engine.transaction('sess1', 'record-issue', () => fail('not allowed in SPAWN'))
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Cannot record-issue')
    expect(result.output).toContain('not allowed in SPAWN')
    expect(appended).toHaveLength(0)
  })

  it('skips appendEvents call when no pending events', () => {
    const appended: BaseEvent[] = []
    const engine = makeEngine({
      store: { appendEvents: (_id, events) => appended.push(...events) },
    })
    const result = engine.transaction('sess1', 'no-op', () => pass())
    expect(result.type).toStrictEqual('success')
    expect(appended).toHaveLength(0)
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(() => engine.transaction('missing', 'record-issue', () => pass()))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('skips identity verification when factory has no prefix config', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    const engine = makeEngine({}, workflow)
    const result = engine.transaction('sess1', 'record-issue', () => pass(), '/transcript.jsonl')
    expect(result.type).toStrictEqual('success')
  })

  it('skips identity verification when no transcript path provided', () => {
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader([]),
      { pattern: /^LEAD:/m, buildRecoveryMessage: () => 'recover' },
    )
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('success')
  })

  it('blocks when identity is lost and factory has prefix config', () => {
    const messages: TranscriptMessage[] = [
      { id: 'msg-1', textContent: 'LEAD: SPAWN' },
      { id: 'msg-2', textContent: 'No prefix here' },
    ]
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader(messages),
      { pattern: /^LEAD:/m, buildRecoveryMessage: (state, emoji, root) => `recover ${state} ${emoji} ${root}` },
    )
    const result = engine.transaction('sess1', 'record-issue', () => pass(), '/transcript.jsonl')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('recover SPAWN')
  })

  it('allows operation when identity is verified', () => {
    const messages: TranscriptMessage[] = [
      { id: 'msg-1', textContent: 'LEAD: SPAWN' },
    ]
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader(messages),
      { pattern: /^LEAD:/m, buildRecoveryMessage: () => 'recover' },
    )
    const result = engine.transaction('sess1', 'record-issue', () => pass(), '/transcript.jsonl')
    expect(result.type).toStrictEqual('success')
  })

  it('emits identity-verified event to store', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const messages: TranscriptMessage[] = [
      { id: 'msg-1', textContent: 'LEAD: SPAWN' },
    ]
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader(messages),
      { pattern: /^LEAD:/m, buildRecoveryMessage: () => 'recover' },
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    engine.transaction('sess1', 'record-issue', () => pass(), '/transcript.jsonl')
    const identityEvent = appended.find((a) => a.events.some((e) => e.type === 'identity-verified'))
    expect(identityEvent).toBeDefined()
  })

  it('uses ClaudeCodeTranscriptReader as default when no transcriptReader provided', () => {
    const testDir = join(import.meta.dirname, '../../../.test-transcripts')
    const testFile = join(testDir, 'engine-default-reader.jsonl')
    mkdirSync(testDir, { recursive: true })
    writeFileSync(testFile, '', 'utf-8')
    try {
      const factory = {
        ...makeFactory(),
        getPrefixConfig: (): PrefixConfig => ({ pattern: /^LEAD:/m, buildRecoveryMessage: () => 'recover' }),
      }
      const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
      const result = engine.transaction('sess1', 'record-issue', () => pass(), testFile)
      expect(result.type).toStrictEqual('success')
    } finally {
      try { unlinkSync(testFile) } catch (_cause) { }
    }
  })
})

describe('WorkflowEngine.transition', () => {
  it('appends pending events on success', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('PLANNING')
    expect(appended[0]?.events[0]?.type).toStrictEqual('transitioned')
  })

  it('returns blocked with procedure when transition fails', () => {
    const workflow = new FailingWorkflow(INITIAL_STATE)
    const engine = makeEngine({}, workflow)
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Cannot transition to PLANNING')
    expect(result.output).toContain('Guard failed')
    expect(result.output).toContain('Do the thing')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(() => engine.transition('missing', 'PLANNING'))
      .toThrow("No session found for 'missing'. Run init first.")
  })
})

describe('WorkflowEngine.persistSessionId', () => {
  it('appends session id export to env file', () => {
    const appended: Array<{ path: string; content: string }> = []
    const engine = makeEngine({
      appendToFile: (path, content) => appended.push({ path, content }),
    })
    engine.persistSessionId('my-session')
    expect(appended[0]?.path).toStrictEqual('/test/claude.env')
    expect(appended[0]?.content).toContain("CLAUDE_SESSION_ID='my-session'")
  })
})

describe('WorkflowEngine.hasSession', () => {
  it('returns true when session exists', () => {
    const engine = makeEngine({ store: { sessionExists: () => true } })
    expect(engine.hasSession('sess1')).toStrictEqual(true)
  })

  it('returns false when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(engine.hasSession('sess1')).toStrictEqual(false)
  })
})

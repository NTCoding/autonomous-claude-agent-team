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
import type { PreconditionResult, WorkflowRegistry, TransitionContext, BashForbiddenConfig } from '../../dsl/index.js'
import { pass, fail } from '../../dsl/index.js'
import type { TranscriptReader } from './transcript-reader.js'
import type { TranscriptMessage } from './transcript-reader.js'
import type { PrefixConfig } from './identity-verification.js'

type TestStateName = 'SPAWN' | 'PLANNING' | 'DEVELOPING' | 'BLOCKED' | 'REVIEWING' | 'RESPAWN'
type TestState = BaseWorkflowState<TestStateName> & { readonly iteration: number }
type TestDeps = { readonly pluginRoot: string }

const INITIAL_STATE: TestState = {
  currentStateMachineState: 'SPAWN' as const,
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

  appendEvent(event: BaseEvent): void {
    this.pending = [...this.pending, event]
    if (event.type === 'transitioned') {
      const e = event as BaseEvent & { to: TestStateName }
      this.state = { ...this.state, currentStateMachineState: e.to }
    }
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

const TEST_REGISTRY: WorkflowRegistry<TestState, TestStateName, string> = {
  SPAWN: {
    emoji: '🟣',
    agentInstructions: 'states/spawn.md',
    canTransitionTo: ['PLANNING', 'BLOCKED'],
    allowedWorkflowOperations: ['record-issue'],
    forbidden: { write: true },
    allowForbidden: { bash: ['pnpm test'] },
  },
  PLANNING: {
    emoji: '🔨',
    agentInstructions: 'states/planning.md',
    canTransitionTo: ['DEVELOPING'],
    allowedWorkflowOperations: [],
  },
  DEVELOPING: {
    emoji: '⚡',
    agentInstructions: 'states/developing.md',
    canTransitionTo: ['REVIEWING'],
    allowedWorkflowOperations: [],
  },
  BLOCKED: {
    emoji: '🚫',
    agentInstructions: 'states/blocked.md',
    canTransitionTo: ['SPAWN'],
    allowedWorkflowOperations: [],
  },
  REVIEWING: {
    emoji: '👀',
    agentInstructions: 'states/reviewing.md',
    canTransitionTo: ['RESPAWN'],
    allowedWorkflowOperations: [],
  },
  RESPAWN: {
    emoji: '🔄',
    agentInstructions: 'states/respawn.md',
    canTransitionTo: [],
    allowedWorkflowOperations: [],
  },
}

function makeFactory(workflow?: StubWorkflow): WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> {
  return {
    rehydrate: (_events, _deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    createFresh: (_deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    procedurePath: (state, pluginRoot) => `${pluginRoot}/states/${state.toLowerCase()}.md`,
    initialState: () => INITIAL_STATE,
    getRegistry: () => TEST_REGISTRY,
    buildTransitionContext: (state, from, to, _deps) => ({
      state,
      gitInfo: { currentBranch: 'main', workingTreeClean: true, headCommit: 'abc123', changedFilesVsDefault: [], hasCommitsVsDefault: false },
      prChecksPass: false,
      from,
      to,
    }),
    getOperationBody: (op, state) => `${op} completed for state ${state.currentStateMachineState}`,
    getTransitionTitle: (to, state) => to === 'RESPAWN' ? `RESPAWN (iteration: ${state.iteration})` : to,
    parseStateName: (v: string) => v as TestStateName,
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
): WorkflowEngine<StubWorkflow, TestState, TestDeps, TestStateName, string> {
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
): WorkflowEngine<StubWorkflow, TestState, TestDeps, TestStateName, string> {
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

  it('uses default operation body when getOperationBody is not provided', () => {
    const { getOperationBody: _, ...rest } = makeFactory()
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = rest
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('record-issue')
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

  it('returns blocked with illegal transition error when target not in canTransitionTo', () => {
    const engine = makeEngine()
    const result = engine.transition('sess1', 'REVIEWING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Illegal transition')
    expect(result.output).toContain('SPAWN -> REVIEWING')
    expect(result.output).toContain('PLANNING')
    expect(result.output).toContain('BLOCKED')
  })

  it('returns blocked when transition guard fails', () => {
    const guardRegistry: WorkflowRegistry<TestState, TestStateName, string> = {
      ...TEST_REGISTRY,
      SPAWN: {
        ...TEST_REGISTRY['SPAWN']!,
        transitionGuard: () => fail('Guard failed: missing issue'),
      },
    }
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      getRegistry: () => guardRegistry,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Cannot transition to PLANNING')
    expect(result.output).toContain('Guard failed')
    expect(result.output).toContain('Do the thing')
  })

  it('skips guard for BLOCKED target', () => {
    const guardRegistry: WorkflowRegistry<TestState, TestStateName, string> = {
      ...TEST_REGISTRY,
      SPAWN: {
        ...TEST_REGISTRY['SPAWN']!,
        transitionGuard: () => fail('Should not run'),
      },
    }
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      getRegistry: () => guardRegistry,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'BLOCKED')
    expect(result.type).toStrictEqual('success')
  })

  it('calls onEntry when present on target state', () => {
    const onEntryCalls: Array<{ state: TestState; from: TestStateName; to: TestStateName }> = []
    const entryRegistry: WorkflowRegistry<TestState, TestStateName, string> = {
      ...TEST_REGISTRY,
      PLANNING: {
        ...TEST_REGISTRY['PLANNING']!,
        onEntry: (state, ctx) => {
          onEntryCalls.push({ state, from: ctx.from, to: ctx.to })
          return { ...state, iteration: state.iteration + 1 }
        },
      },
    }
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      getRegistry: () => entryRegistry,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(onEntryCalls).toHaveLength(1)
    expect(onEntryCalls[0]).toMatchObject({ from: 'SPAWN', to: 'PLANNING' })
  })

  it('calls afterEntry when present on target state', () => {
    let afterEntryCalled = false
    const afterEntryRegistry: WorkflowRegistry<TestState, TestStateName, string> = {
      ...TEST_REGISTRY,
      PLANNING: {
        ...TEST_REGISTRY['PLANNING']!,
        afterEntry: () => { afterEntryCalled = true },
      },
    }
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      getRegistry: () => afterEntryRegistry,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(afterEntryCalled).toStrictEqual(true)
  })

  it('uses custom buildTransitionEvent when provided', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      buildTransitionEvent: (from, to, _before, _after, now) => ({
        type: 'transitioned',
        at: now,
        from,
        to,
        iteration: 42,
      }),
    }
    const engine = new WorkflowEngine(
      factory,
      makeEngineDeps({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } }),
      makeTestDeps(),
    )
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    const transitioned = appended[0]?.events[0] as BaseEvent & { iteration: number }
    expect(transitioned.iteration).toStrictEqual(42)
  })

  it('uses default transition event when buildTransitionEvent is not provided', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    const transitioned = appended[0]?.events[0] as BaseEvent & { from: TestStateName; to: TestStateName }
    expect(transitioned.from).toStrictEqual('SPAWN')
    expect(transitioned.to).toStrictEqual('PLANNING')
  })

  it('uses default transition title when getTransitionTitle is not provided', () => {
    const { getTransitionTitle: _, ...rest } = makeFactory()
    const factory: WorkflowFactory<StubWorkflow, TestState, TestDeps, TestStateName, string> = rest
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('PLANNING')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(() => engine.transition('missing', 'PLANNING'))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('returns blocked with empty legal targets when state has no transitions', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'RESPAWN', iteration: 0 })
    const engine = makeEngine({}, workflow)
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Illegal transition')
    expect(result.output).toContain('none')
  })

})

describe('WorkflowEngine.checkBash', () => {
  const bashForbidden: BashForbiddenConfig = {
    patterns: [/git push/],
    flags: ['--force'],
  }

  it('allows non-Bash tools', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    const result = engine.checkBash('sess1', 'Read', 'anything', bashForbidden)
    expect(result.type).toStrictEqual('success')
    const event = appended[0]?.events[0] as BaseEvent & { tool: string; allowed: boolean }
    expect(event.type).toStrictEqual('bash-checked')
    expect(event.tool).toStrictEqual('Read')
    expect(event.allowed).toStrictEqual(true)
  })

  it('allows Bash commands that are not forbidden', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    const result = engine.checkBash('sess1', 'Bash', 'pnpm test', bashForbidden)
    expect(result.type).toStrictEqual('success')
    const event = appended[0]?.events[0] as BaseEvent & { allowed: boolean }
    expect(event.allowed).toStrictEqual(true)
  })

  it('blocks Bash commands matching forbidden patterns', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    const result = engine.checkBash('sess1', 'Bash', 'git push origin main', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Bash command blocked')
    const event = appended[0]?.events[0] as BaseEvent & { allowed: boolean; reason: string }
    expect(event.allowed).toStrictEqual(false)
  })

  it('blocks Bash commands with forbidden flags', () => {
    const engine = makeEngine()
    const result = engine.checkBash('sess1', 'Bash', 'git commit --force', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Forbidden flag')
  })

  it('uses state exemptions from registry', () => {
    const engine = makeEngine()
    const pnpmForbidden: BashForbiddenConfig = {
      patterns: [/pnpm/],
    }
    const result = engine.checkBash('sess1', 'Bash', 'pnpm test', pnpmForbidden)
    expect(result.type).toStrictEqual('success')
  })

  it('uses empty exemptions when state has no allowForbidden', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'PLANNING', iteration: 0 })
    const engine = makeEngine({}, workflow)
    const result = engine.checkBash('sess1', 'Bash', 'git push origin main', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(() => engine.checkBash('missing', 'Bash', 'ls', bashForbidden))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('blocks when identity is lost', () => {
    const messages: TranscriptMessage[] = [
      { id: 'msg-1', textContent: 'LEAD: SPAWN' },
      { id: 'msg-2', textContent: 'No prefix here' },
    ]
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader(messages),
      { pattern: /^LEAD:/m, buildRecoveryMessage: () => 'identity lost' },
    )
    const result = engine.checkBash('sess1', 'Bash', 'ls', bashForbidden, '/transcript.jsonl')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('identity lost')
  })
})

describe('WorkflowEngine.checkWrite', () => {
  const alwaysAllow = (): PreconditionResult => pass()
  const alwaysDeny = (_t: string, _f: string, _s: TestState): PreconditionResult => fail('Write forbidden')

  it('allows writes when state has no write forbidden', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'PLANNING', iteration: 0 })
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine(
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
      workflow,
    )
    const result = engine.checkWrite('sess1', 'Edit', '/some/file.ts', alwaysDeny)
    expect(result.type).toStrictEqual('success')
    const event = appended[0]?.events[0] as BaseEvent & { allowed: boolean }
    expect(event.type).toStrictEqual('write-checked')
    expect(event.allowed).toStrictEqual(true)
  })

  it('checks predicate when state has write forbidden', () => {
    const engine = makeEngine()
    const result = engine.checkWrite('sess1', 'Edit', '/some/file.ts', alwaysDeny)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Write forbidden')
  })

  it('allows write when predicate passes in forbidden state', () => {
    const engine = makeEngine()
    const result = engine.checkWrite('sess1', 'Edit', '/state/file.ts', alwaysAllow)
    expect(result.type).toStrictEqual('success')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false } })
    expect(() => engine.checkWrite('missing', 'Edit', '/file.ts', alwaysAllow))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('blocks when identity is lost', () => {
    const messages: TranscriptMessage[] = [
      { id: 'msg-1', textContent: 'LEAD: SPAWN' },
      { id: 'msg-2', textContent: 'No prefix here' },
    ]
    const engine = makeEngineWithPrefixConfig(
      stubTranscriptReader(messages),
      { pattern: /^LEAD:/m, buildRecoveryMessage: () => 'identity lost' },
    )
    const result = engine.checkWrite('sess1', 'Edit', '/file.ts', alwaysAllow, '/transcript.jsonl')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('identity lost')
  })

  it('appends denied write-checked event with reason', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({ store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } })
    engine.checkWrite('sess1', 'Edit', '/file.ts', alwaysDeny)
    const event = appended[0]?.events[0] as BaseEvent & { allowed: boolean; reason: string }
    expect(event.allowed).toStrictEqual(false)
    expect(event.reason).toStrictEqual('Write forbidden')
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

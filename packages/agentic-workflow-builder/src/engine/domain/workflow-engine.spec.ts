import { z } from 'zod'
import { WorkflowEngine } from './workflow-engine.js'
import type {
  RehydratableWorkflow,
  WorkflowDefinition,
  WorkflowEventStore,
  WorkflowEngineDeps,
} from './workflow-engine.js'
import type { BaseWorkflowState } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import type { PreconditionResult, WorkflowRegistry, BashForbiddenConfig } from '../../dsl/index.js'
import { pass, fail } from '../../dsl/index.js'
import type { TranscriptReader } from './transcript-reader.js'

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
  private storedTranscriptPath: string | undefined

  constructor(state: TestState) {
    this.state = { ...state }
  }

  getState(): TestState { return this.state }

  appendEvent(event: BaseEvent): void {
    this.pending = [...this.pending, event]
    if (event.type === 'transitioned') {
      const e = event as BaseEvent & { to: TestStateName }
      this.state = { ...this.state, currentStateMachineState: e.to }
    }
    if (event.type === 'session-started') {
      const e = event as BaseEvent & { transcriptPath?: string }
      if (e.transcriptPath !== undefined) this.storedTranscriptPath = e.transcriptPath
    }
  }

  getPendingEvents(): readonly BaseEvent[] { return this.pending }

  addPendingEvent(event: BaseEvent): void {
    this.pending = [...this.pending, event]
  }

  startSession(transcriptPath: string, repository: string | undefined): void {
    const event: BaseEvent = {
      type: 'session-started',
      at: '2026-01-01T00:00:00.000Z',
      transcriptPath,
      ...(repository === undefined ? {} : { repository }),
    }
    this.pending = [...this.pending, event]
    this.storedTranscriptPath = transcriptPath
  }

  getTranscriptPath(): string {
    if (this.storedTranscriptPath === undefined) throw new Error('Session not started')
    return this.storedTranscriptPath
  }

  registerAgent(agentType: string, agentId: string): PreconditionResult {
    this.pending = [...this.pending, { type: 'agent-registered', at: '2026-01-01T00:00:00.000Z', agentType, agentId }]
    return pass()
  }

  handleTeammateIdle(_agentName: string): PreconditionResult {
    return pass()
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

function makeFactory(workflow?: StubWorkflow): WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> {
  return {
    fold: (state, event) => {
      if (event.type === 'transitioned') {
        const e = event as BaseEvent & { to: TestStateName }
        return { ...state, currentStateMachineState: e.to }
      }
      return state
    },
    buildWorkflow: (_state, _deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    stateSchema: z.enum(['SPAWN', 'PLANNING', 'DEVELOPING', 'BLOCKED', 'REVIEWING', 'RESPAWN']),
    initialState: () => INITIAL_STATE,
    getRegistry: () => TEST_REGISTRY,
    buildTransitionContext: (state, from, to, _deps) => ({
      state,
      gitInfo: { currentBranch: 'main', workingTreeClean: true, headCommit: 'abc123', changedFilesVsDefault: [], hasCommitsVsDefault: false },
      from,
      to,
    }),
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
    hasSessionStarted: () => true,
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
    transcriptReader: { readMessages: () => [] },
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

// Helper to make an engine with a workflow that has a transcript path set
function makeEngineWithSession(
  transcriptReader: TranscriptReader,
  workflow: StubWorkflow,
  engineOverrides?: EngineDepsOverrides,
): WorkflowEngine<StubWorkflow, TestState, TestDeps, TestStateName, string> {
  return new WorkflowEngine(
    makeFactory(workflow),
    makeEngineDeps({ ...engineOverrides, transcriptReader }),
    makeTestDeps(),
  )
}

describe('WorkflowEngine.startSession', () => {
  it('creates initial session-started event when no session exists', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: {
        sessionExists: () => false,
        hasSessionStarted: () => false,
        appendEvents: (sessionId, events) => appended.push({ sessionId, events }),
      },
    })
    const result = engine.startSession('sess1', '/transcript.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Feature team initialized')
    expect(appended[0]?.events[0]?.type).toStrictEqual('session-started')
    expect(appended[0]?.events[0]).toMatchObject({ transcriptPath: '/transcript.jsonl' })
  })

  it('persists session-started event with session id in SPAWN state', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: {
        sessionExists: () => false,
        hasSessionStarted: () => false,
        appendEvents: (sessionId, events) => appended.push({ sessionId, events }),
      },
    })
    engine.startSession('sess1', '/t.jsonl')
    expect(appended[0]?.sessionId).toStrictEqual('sess1')
    expect(appended[0]?.events[0]?.type).toStrictEqual('session-started')
  })

  it('forwards repository to session-started event', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: {
        sessionExists: () => false,
        hasSessionStarted: () => false,
        appendEvents: (sessionId, events) => appended.push({ sessionId, events }),
      },
    })
    engine.startSession('sess1', '/t.jsonl', 'owner/repo')
    expect(appended[0]?.events[0]).toMatchObject({ repository: 'owner/repo' })
  })

  it('returns empty output when session already exists', () => {
    const engine = makeEngine({ store: { sessionExists: () => true, hasSessionStarted: () => true } })
    const result = engine.startSession('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toStrictEqual('')
  })

  it('starts session when generic events exist but session-started is missing', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngine({
      store: {
        sessionExists: () => true,
        hasSessionStarted: () => false,
        appendEvents: (sessionId, events) => appended.push({ sessionId, events }),
      },
    })

    const result = engine.startSession('sess1', '/t.jsonl')

    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Feature team initialized')
    expect(appended[0]?.events[0]?.type).toStrictEqual('session-started')
  })

  it('output contains prefix footer for initial state', () => {
    const engine = makeEngine({
      store: { sessionExists: () => false, hasSessionStarted: () => false, appendEvents: () => undefined },
    })
    const result = engine.startSession('sess1', '/t.jsonl')
    expect(result.output).toContain('Next message MUST begin with: 🟣 SPAWN')
  })
})

describe('WorkflowEngine.transaction', () => {
  it('executes operation, appends pending events when precondition passes', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow, {
      store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) },
    })
    const result = engine.transaction('sess1', 'record-issue', (w) => {
      w.addPendingEvent({ type: 'issue-recorded', at: '2026-01-01T00:00:00.000Z' })
      return pass()
    })
    expect(result.type).toStrictEqual('success')
    expect(appended.flatMap((a) => a.events).some((e) => e.type === 'issue-recorded')).toBe(true)
  })

  it('does not append non-identity events when precondition fails', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const appended: BaseEvent[] = []
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow, {
      store: { appendEvents: (_id, events) => appended.push(...events) },
    })
    const result = engine.transaction('sess1', 'record-issue', () => fail('not allowed in SPAWN'))
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Cannot record-issue')
    expect(result.output).toContain('not allowed in SPAWN')
    // Operation event is NOT appended — only setup (session-started) and identity-verified
    expect(appended.some((e) => e.type === 'issue-recorded')).toBe(false)
    expect(appended.some((e) => e.type === 'identity-verified')).toBe(true)
  })

  it('skips appendEvents call when no pending events', () => {
    const appended: BaseEvent[] = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow, {
      store: { appendEvents: (_id, events) => appended.push(...events) },
    })
    const result = engine.transaction('sess1', 'no-op', () => pass())
    expect(result.type).toStrictEqual('success')
    // Only setup (session-started) and identity-verified events — no operation events
    expect(appended.some((e) => e.type !== 'identity-verified' && e.type !== 'session-started')).toBe(false)
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false, hasSessionStarted: () => false } })
    expect(() => engine.transaction('missing', 'record-issue', () => pass()))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('blocks when identity is lost (last message lacks prefix)', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      {
        readMessages: () => [
          { id: 'msg-1', textContent: '🟣 SPAWN: doing stuff' },
          { id: 'msg-2', textContent: 'No prefix here' },
        ],
      },
      workflow,
    )
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('You forgot')
    expect(result.output).toContain('Next message MUST begin with:')
  })

  it('allows when identity is verified (last message has prefix)', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      {
        readMessages: () => [
          { id: 'msg-1', textContent: '🟣 SPAWN: doing stuff' },
        ],
      },
      workflow,
    )
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('success')
  })

  it('allows when agent has never spoken (new session)', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('success')
  })

  it('emits identity-verified event to store', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [{ id: 'msg-1', textContent: '🟣 SPAWN: doing stuff' }] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    engine.transaction('sess1', 'record-issue', () => pass())
    const identityEvent = appended.find((a) => a.events.some((e) => e.type === 'identity-verified'))
    expect(identityEvent).toBeDefined()
  })

  it('uses default operation body when getOperationBody is not provided', () => {
    const { getOperationBody: _, ...rest } = makeFactory()
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = rest
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factoryWithWorkflow = { ...factory, buildWorkflow: () => workflow }
    const engine = new WorkflowEngine(factoryWithWorkflow, makeEngineDeps(), makeTestDeps())
    const result = engine.transaction('sess1', 'record-issue', () => pass())
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('record-issue')
  })
})

describe('WorkflowEngine.transition', () => {
  it('appends pending events on success', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('PLANNING')
    expect(appended.flatMap((a) => a.events).some((e) => e.type === 'transitioned')).toBe(true)
  })

  it('returns blocked with illegal transition error when target not in canTransitionTo', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
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
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(workflow),
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
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(workflow),
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
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(workflow),
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
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(workflow),
      getRegistry: () => afterEntryRegistry,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(afterEntryCalled).toStrictEqual(true)
  })

  it('uses custom buildTransitionEvent when provided', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(workflow),
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
    const allEvents = appended.flatMap((a) => a.events)
    const transitioned = allEvents.find((e) => e.type === 'transitioned') as BaseEvent & { iteration: number } | undefined
    expect(transitioned?.iteration).toStrictEqual(42)
  })

  it('uses default transition event when buildTransitionEvent is not provided', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    const allEvents = appended.flatMap((a) => a.events)
    const transitioned = allEvents.find((e) => e.type === 'transitioned') as BaseEvent & { from: TestStateName; to: TestStateName } | undefined
    expect(transitioned?.from).toStrictEqual('SPAWN')
    expect(transitioned?.to).toStrictEqual('PLANNING')
  })

  it('uses default transition title when getTransitionTitle is not provided', () => {
    const { getTransitionTitle: _, ...rest } = makeFactory()
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...rest,
      buildWorkflow: () => workflow,
    }
    const engine = new WorkflowEngine(factory, makeEngineDeps(), makeTestDeps())
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('PLANNING')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false, hasSessionStarted: () => false } })
    expect(() => engine.transition('missing', 'PLANNING'))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('returns blocked with empty legal targets when state has no transitions', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'RESPAWN', iteration: 0 })
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Illegal transition')
    expect(result.output).toContain('none')
  })

  it('blocks transition when identity is lost', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      {
        readMessages: () => [
          { id: 'msg-1', textContent: '🟣 SPAWN: stuff' },
          { id: 'msg-2', textContent: 'No prefix' },
        ],
      },
      workflow,
    )
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('You forgot')
  })

  it('output contains prefix footer after transition', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.output).toContain('Next message MUST begin with: 🔨 PLANNING')
  })
})

describe('WorkflowEngine.checkBash', () => {
  const bashForbidden: BashForbiddenConfig = {
    commands: ['git push'],
    flags: ['--force'],
  }

  it('allows non-Bash tools', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.checkBash('sess1', 'Read', 'anything', bashForbidden)
    expect(result.type).toStrictEqual('success')
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'bash-checked') as BaseEvent & { tool: string; allowed: boolean } | undefined
    expect(event?.tool).toStrictEqual('Read')
    expect(event?.allowed).toStrictEqual(true)
  })

  it('allows Bash commands that are not forbidden', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.checkBash('sess1', 'Bash', 'pnpm test', bashForbidden)
    expect(result.type).toStrictEqual('success')
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'bash-checked') as BaseEvent & { allowed: boolean } | undefined
    expect(event?.allowed).toStrictEqual(true)
  })

  it('blocks Bash commands matching forbidden commands', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.checkBash('sess1', 'Bash', 'git push origin main', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Bash command blocked')
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'bash-checked') as BaseEvent & { allowed: boolean; reason: string } | undefined
    expect(event?.allowed).toStrictEqual(false)
  })

  it('blocks Bash commands with forbidden flags', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.checkBash('sess1', 'Bash', 'git commit --force', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Forbidden flag')
  })

  it('uses state exemptions from registry', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const pnpmForbidden: BashForbiddenConfig = {
      commands: ['pnpm'],
    }
    const result = engine.checkBash('sess1', 'Bash', 'pnpm test', pnpmForbidden)
    expect(result.type).toStrictEqual('success')
  })

  it('uses empty exemptions when state has no allowForbidden', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'PLANNING', iteration: 0 })
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.checkBash('sess1', 'Bash', 'git push origin main', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false, hasSessionStarted: () => false } })
    expect(() => engine.checkBash('missing', 'Bash', 'ls', bashForbidden))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('blocks when identity is lost', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      {
        readMessages: () => [
          { id: 'msg-1', textContent: '🟣 SPAWN: doing stuff' },
          { id: 'msg-2', textContent: 'No prefix here' },
        ],
      },
      workflow,
    )
    const result = engine.checkBash('sess1', 'Bash', 'ls', bashForbidden)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('You forgot')
  })
})

describe('WorkflowEngine.checkWrite', () => {
  const alwaysAllow = (): boolean => true
  const alwaysDeny = (): boolean => false

  it('allows writes for non-write tools', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'PLANNING', iteration: 0 })
    workflow.startSession('/t.jsonl', undefined)
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.checkWrite('sess1', 'Read', '/some/file.ts', alwaysDeny)
    expect(result.type).toStrictEqual('success')
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'write-checked') as BaseEvent & { allowed: boolean } | undefined
    expect(event?.type).toStrictEqual('write-checked')
    expect(event?.allowed).toStrictEqual(true)
  })

  it('allows writes when state has no write forbidden', () => {
    const workflow = new StubWorkflow({ currentStateMachineState: 'PLANNING', iteration: 0 })
    workflow.startSession('/t.jsonl', undefined)
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    const result = engine.checkWrite('sess1', 'Edit', '/some/file.ts', alwaysDeny)
    expect(result.type).toStrictEqual('success')
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'write-checked') as BaseEvent & { allowed: boolean } | undefined
    expect(event?.type).toStrictEqual('write-checked')
    expect(event?.allowed).toStrictEqual(true)
  })

  it('checks predicate when state has write forbidden', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.checkWrite('sess1', 'Edit', '/some/file.ts', alwaysDeny)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain("Write to '/some/file.ts' is forbidden")
  })

  it('allows write when predicate passes in forbidden state', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.checkWrite('sess1', 'Edit', '/state/file.ts', alwaysAllow)
    expect(result.type).toStrictEqual('success')
  })

  it('allows write to store path even in forbidden state', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession({ readMessages: () => [] }, workflow)
    const result = engine.checkWrite('sess1', 'Write', '/plugin/workflow.db', alwaysDeny)
    expect(result.type).toStrictEqual('success')
  })

  it('throws WorkflowStateError when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false, hasSessionStarted: () => false } })
    expect(() => engine.checkWrite('missing', 'Edit', '/file.ts', alwaysAllow))
      .toThrow("No session found for 'missing'. Run init first.")
  })

  it('blocks when identity is lost', () => {
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      {
        readMessages: () => [
          { id: 'msg-1', textContent: '🟣 SPAWN: doing stuff' },
          { id: 'msg-2', textContent: 'No prefix here' },
        ],
      },
      workflow,
    )
    const result = engine.checkWrite('sess1', 'Edit', '/file.ts', alwaysAllow)
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('You forgot')
  })

  it('appends denied write-checked event with reason', () => {
    const appended: Array<{ sessionId: string; events: readonly BaseEvent[] }> = []
    const workflow = new StubWorkflow(INITIAL_STATE)
    workflow.startSession('/t.jsonl', undefined)
    const engine = makeEngineWithSession(
      { readMessages: () => [] },
      workflow,
      { store: { appendEvents: (id, events) => appended.push({ sessionId: id, events }) } },
    )
    engine.checkWrite('sess1', 'Edit', '/file.ts', alwaysDeny)
    const allEvents = appended.flatMap((a) => a.events)
    const event = allEvents.find((e) => e.type === 'write-checked') as BaseEvent & { allowed: boolean; reason: string } | undefined
    expect(event?.allowed).toStrictEqual(false)
    expect(event?.reason).toContain('/file.ts')
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
    const engine = makeEngine({ store: { sessionExists: () => true, hasSessionStarted: () => true } })
    expect(engine.hasSession('sess1')).toStrictEqual(true)
  })

  it('returns false when session does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => false, hasSessionStarted: () => false } })
    expect(engine.hasSession('sess1')).toStrictEqual(false)
  })
})

describe('WorkflowEngine.hasSessionStarted', () => {
  it('returns true when session-started event exists', () => {
    const engine = makeEngine({ store: { sessionExists: () => true, hasSessionStarted: () => true } })
    expect(engine.hasSessionStarted('sess1')).toStrictEqual(true)
  })

  it('returns false when session-started event does not exist', () => {
    const engine = makeEngine({ store: { sessionExists: () => true, hasSessionStarted: () => false } })
    expect(engine.hasSessionStarted('sess1')).toStrictEqual(false)
  })
})

describe('WorkflowEngine rehydration', () => {
  it('uses fold to rehydrate state from events', () => {
    const events: BaseEvent[] = [
      { type: 'transitioned', at: '2026-01-01T00:00:00.000Z', from: 'SPAWN', to: 'PLANNING' },
    ]
    let capturedState: TestState | undefined
    const factory: WorkflowDefinition<StubWorkflow, TestState, TestDeps, TestStateName, string> = {
      ...makeFactory(),
      buildWorkflow: (state, _deps) => {
        capturedState = state
        const w = new StubWorkflow(state)
        w.startSession('/t.jsonl', undefined)
        return w
      },
    }
    const engine = new WorkflowEngine(
      factory,
      makeEngineDeps({ store: { readEvents: () => events } }),
      makeTestDeps(),
    )
    engine.transaction('sess1', 'no-op', () => pass())
    expect(capturedState?.currentStateMachineState).toStrictEqual('PLANNING')
  })
})

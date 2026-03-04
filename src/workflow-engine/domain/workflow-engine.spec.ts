import { WorkflowEngine } from './workflow-engine.js'
import type {
  RehydratableWorkflow,
  WorkflowFactory,
  WorkflowEventStore,
  WorkflowEngineDeps,
  WorkflowDeps,
} from './workflow-engine.js'
import type { WorkflowState } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import type { PreconditionResult } from '../../workflow-dsl/index.js'
import { pass, fail } from '../../workflow-dsl/index.js'

const INITIAL_STATE: WorkflowState = {
  state: 'SPAWN',
  iteration: 0,
  iterations: [],
  userApprovedPlan: false,
  activeAgents: [],
}

function makeWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return { ...INITIAL_STATE, ...overrides }
}

class StubWorkflow implements RehydratableWorkflow {
  private state: WorkflowState
  private pending: BaseEvent[] = []

  constructor(state: WorkflowState) {
    this.state = { ...state }
  }

  getState(): WorkflowState {
    return this.state
  }

  getAgentInstructions(_pluginRoot: string): string {
    return '/plugin/states/spawn.md'
  }

  transitionTo(target: string): PreconditionResult {
    const event: BaseEvent = { type: 'transitioned', at: '2026-01-01T00:00:00.000Z' }
    this.pending = [...this.pending, event]
    this.state = { ...this.state, state: target }
    return pass()
  }

  getPendingEvents(): readonly BaseEvent[] {
    return this.pending
  }

  addPendingEvent(event: BaseEvent): void {
    this.pending = [...this.pending, event]
  }

  verifyIdentity(_transcriptPath: string): PreconditionResult {
    return pass()
  }

  startSession(transcriptPath: string | undefined): void {
    const event: BaseEvent = {
      type: 'session-started',
      at: '2026-01-01T00:00:00.000Z',
      ...(transcriptPath === undefined ? {} : { transcriptPath }),
    }
    this.pending = [...this.pending, event]
  }
}

class FailingWorkflow extends StubWorkflow {
  override transitionTo(_target: string): PreconditionResult {
    return fail('Guard failed: missing issue')
  }
}

function makeFactory(workflow?: StubWorkflow): WorkflowFactory<StubWorkflow> {
  return {
    rehydrate: (_events, _deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    createFresh: (_deps) => workflow ?? new StubWorkflow(INITIAL_STATE),
    procedurePath: (state, pluginRoot) => `${pluginRoot}/states/${state.toLowerCase()}.md`,
    initialState: () => INITIAL_STATE,
    getEmojiForState: (state) => state === 'SPAWN' ? '🟣' : '🔨',
    getOperationBody: (op, state) => `${op} completed for state ${state.state}`,
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

function makeWorkflowDeps(): WorkflowDeps {
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
    now: () => '2026-01-01T00:00:00.000Z',
    readTranscriptMessages: () => [],
  }
}

function makeEngine(
  engineOverrides?: EngineDepsOverrides,
  factoryWorkflow?: StubWorkflow,
): WorkflowEngine<StubWorkflow> {
  return new WorkflowEngine(
    makeFactory(factoryWorkflow),
    makeEngineDeps(engineOverrides),
    makeWorkflowDeps(),
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

void makeWorkflowState

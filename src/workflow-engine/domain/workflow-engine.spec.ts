import { WorkflowEngine } from './workflow-engine.js'
import type {
  RehydratableWorkflow,
  WorkflowFactory,
  WorkflowEngineDeps,
  WorkflowDeps,
  EngineResult,
} from './workflow-engine.js'
import type { WorkflowState } from './workflow-state.js'
import type { PreconditionResult } from '../../workflow-dsl/index.js'
import { pass, fail } from '../../workflow-dsl/index.js'

const INITIAL_STATE: WorkflowState = {
  state: 'SPAWN',
  iteration: 0,
  iterations: [],
  userApprovedPlan: false,
  activeAgents: [],
  eventLog: [],
}

function makeWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return { ...INITIAL_STATE, ...overrides }
}

class StubWorkflow implements RehydratableWorkflow {
  private state: WorkflowState

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
    this.state = { ...this.state, state: target }
    return pass()
  }

  registerAgent(agentType: string, _agentId: string): PreconditionResult {
    this.state = {
      ...this.state,
      activeAgents: [...this.state.activeAgents, agentType],
    }
    return pass()
  }

  checkIdleAllowed(_agentName: string): PreconditionResult {
    return pass()
  }

  shutDown(agentName: string): PreconditionResult {
    this.state = {
      ...this.state,
      activeAgents: this.state.activeAgents.filter((a) => a !== agentName),
    }
    return pass()
  }

  runLint(_files: readonly string[]): PreconditionResult {
    return pass()
  }
}

class FailingWorkflow extends StubWorkflow {
  override transitionTo(_target: string): PreconditionResult {
    return fail('Guard failed: missing issue')
  }

  override checkIdleAllowed(_agentName: string): PreconditionResult {
    return fail('Lead cannot go idle')
  }

  override runLint(_files: readonly string[]): PreconditionResult {
    return fail('Lint failed. Fix all violations before proceeding.')
  }
}

function makeFactory(workflow?: StubWorkflow): WorkflowFactory<StubWorkflow> {
  return {
    rehydrate: (state, _deps) => workflow ?? new StubWorkflow(state),
    procedurePath: (state, pluginRoot) => `${pluginRoot}/states/${state.toLowerCase()}.md`,
    initialState: () => INITIAL_STATE,
    getEmojiForState: (state) => state === 'SPAWN' ? '🟣' : '🔨',
    getOperationBody: (op, state) => `${op} completed for state ${state.state}`,
    getTransitionTitle: (to, state) => to === 'RESPAWN' ? `RESPAWN (iteration: ${state.iteration})` : to,
  }
}

function makeEngineDeps(overrides?: Partial<WorkflowEngineDeps>): WorkflowEngineDeps {
  return {
    readState: () => INITIAL_STATE,
    writeState: () => undefined,
    stateFileExists: () => true,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    getPluginRoot: () => '/plugin',
    getEnvFilePath: () => '/test/claude.env',
    readFile: () => '# Procedure\n\n- [ ] Do the thing',
    readTranscriptMessages: () => [],
    appendToFile: () => undefined,
    now: () => '2026-01-01T00:00:00.000Z',
    ...overrides,
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
  }
}

function makeEngine(
  engineOverrides?: Partial<WorkflowEngineDeps>,
  factoryWorkflow?: StubWorkflow,
): WorkflowEngine<StubWorkflow> {
  return new WorkflowEngine(
    makeFactory(factoryWorkflow),
    makeEngineDeps(engineOverrides),
    makeWorkflowDeps(),
  )
}

describe('WorkflowEngine.startSession', () => {
  it('creates initial state when no state file exists', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({
      stateFileExists: () => false,
      writeState: (_, s) => { written.push(s) },
    })
    const result = engine.startSession('sess1', '/transcript.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Feature team initialized')
    expect(written[0]?.state).toStrictEqual('SPAWN')
    expect(written[0]?.transcriptPath).toStrictEqual('/transcript.jsonl')
  })

  it('creates initial state without transcriptPath when omitted', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({
      stateFileExists: () => false,
      writeState: (_, s) => { written.push(s) },
    })
    const result = engine.startSession('sess1')
    expect(result.type).toStrictEqual('success')
    expect(written[0]?.transcriptPath).toBeUndefined()
  })

  it('includes init event in event log', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({
      stateFileExists: () => false,
      writeState: (_, s) => { written.push(s) },
      now: () => '2026-06-15T10:00:00.000Z',
    })
    engine.startSession('sess1', '/t.jsonl')
    expect(written[0]?.eventLog[0]?.op).toStrictEqual('init')
    expect(written[0]?.eventLog[0]?.at).toStrictEqual('2026-06-15T10:00:00.000Z')
  })

  it('returns empty output when state file already exists', () => {
    const engine = makeEngine({ stateFileExists: () => true })
    const result = engine.startSession('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toStrictEqual('')
  })
})

describe('WorkflowEngine.transaction', () => {
  it('executes operation and persists when precondition passes', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({ writeState: (_, s) => { written.push(s) } })
    const result = engine.transaction('sess1', 'record-issue', (w) => {
      const state = w.getState()
      Object.assign(w, { getState: () => ({ ...state, githubIssue: 42 }) })
      return pass()
    })
    expect(result.type).toStrictEqual('success')
    expect(written[0]).toStrictEqual(expect.objectContaining({ githubIssue: 42 }))
  })

  it('returns blocked when precondition fails', () => {
    const engine = makeEngine()
    const result = engine.transaction('sess1', 'record-issue', () => fail('not allowed in SPAWN'))
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Cannot record-issue')
    expect(result.output).toContain('not allowed in SPAWN')
  })
})

describe('WorkflowEngine.transition', () => {
  it('transitions and persists on success', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({ writeState: (_, s) => { written.push(s) } })
    const result = engine.transition('sess1', 'PLANNING')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('PLANNING')
    expect(written[0]?.state).toStrictEqual('PLANNING')
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
})

describe('WorkflowEngine.registerAgent', () => {
  it('registers agent and returns subagent context', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({ writeState: (_, s) => { written.push(s) } })
    const result = engine.registerAgent('sess1', 'developer-1', 'agt-1')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Current workflow state: SPAWN')
    expect(result.output).toContain('developer-1')
    expect(written[0]?.activeAgents).toContain('developer-1')
  })
})

describe('WorkflowEngine.checkIdleAllowed', () => {
  it('returns success when idle is allowed', () => {
    const engine = makeEngine()
    const result = engine.checkIdleAllowed('sess1', 'developer-1')
    expect(result.type).toStrictEqual('success')
  })

  it('returns blocked when idle is not allowed', () => {
    const workflow = new FailingWorkflow(INITIAL_STATE)
    const engine = makeEngine({}, workflow)
    const result = engine.checkIdleAllowed('sess1', 'lead-1')
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Lead cannot go idle')
  })
})

describe('WorkflowEngine.shutDown', () => {
  it('deregisters agent and persists', () => {
    const state = makeWorkflowState({ activeAgents: ['developer-1'] })
    const written: WorkflowState[] = []
    const workflow = new StubWorkflow(state)
    const engine = makeEngine(
      { writeState: (_, s) => { written.push(s) } },
      workflow,
    )
    const result = engine.shutDown('sess1', 'developer-1')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('deregistered')
    expect(written[0]?.activeAgents).toStrictEqual([])
  })

  it('returns error when no state file exists', () => {
    const engine = makeEngine({ stateFileExists: () => false })
    const result = engine.shutDown('sess1', 'developer-1')
    expect(result.type).toStrictEqual('error')
    expect(result.output).toContain('no state file')
  })
})

describe('WorkflowEngine.runLint', () => {
  it('returns success when lint passes', () => {
    const written: WorkflowState[] = []
    const engine = makeEngine({ writeState: (_, s) => { written.push(s) } })
    const result = engine.runLint('sess1', [])
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('Lint passed')
  })

  it('returns success with message when no state file', () => {
    const engine = makeEngine({ stateFileExists: () => false })
    const result = engine.runLint('sess1', [])
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('no state file')
  })

  it('returns blocked when lint fails', () => {
    const workflow = new FailingWorkflow(INITIAL_STATE)
    const engine = makeEngine({}, workflow)
    const result = engine.runLint('sess1', ['bad.ts'])
    expect(result.type).toStrictEqual('blocked')
    expect(result.output).toContain('Lint failed')
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

describe('WorkflowEngine.verifyIdentity', () => {
  it('returns empty output when no state file', () => {
    const engine = makeEngine({ stateFileExists: () => false })
    const result = engine.verifyIdentity('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toStrictEqual('')
  })

  it('returns empty output when identity is verified', () => {
    const engine = makeEngine({
      readTranscriptMessages: () => [
        { id: '1', hasTextContent: true, startsWithLeadPrefix: true },
      ],
    })
    const result = engine.verifyIdentity('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toStrictEqual('')
  })

  it('returns recovery message when identity is lost', () => {
    const engine = makeEngine({
      readState: () => makeWorkflowState({ state: 'PLANNING' }),
      readTranscriptMessages: () => [
        { id: '1', hasTextContent: true, startsWithLeadPrefix: true },
        { id: '2', hasTextContent: true, startsWithLeadPrefix: false },
      ],
    })
    const result = engine.verifyIdentity('sess1', '/t.jsonl')
    expect(result.type).toStrictEqual('success')
    expect(result.output).toContain('lost your feature-team-lead identity')
    expect(result.output).toContain('Do the thing')
  })
})

describe('WorkflowEngine.hasSession', () => {
  it('returns true when state file exists', () => {
    const engine = makeEngine({ stateFileExists: () => true })
    expect(engine.hasSession('sess1')).toStrictEqual(true)
  })

  it('returns false when state file does not exist', () => {
    const engine = makeEngine({ stateFileExists: () => false })
    expect(engine.hasSession('sess1')).toStrictEqual(false)
  })
})


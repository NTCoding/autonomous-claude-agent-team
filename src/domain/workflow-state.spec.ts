import { WorkflowState, StateName, EventLogEntry, INITIAL_STATE } from './workflow-state.js'

describe('StateName', () => {
  it('accepts all valid state names', () => {
    const valid = [
      'SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING',
      'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK', 'BLOCKED', 'COMPLETE',
    ]
    valid.forEach(s => expect(StateName.parse(s)).toStrictEqual(s))
  })

  it('rejects unknown state names', () => {
    expect(() => StateName.parse('UNKNOWN')).toThrow('Invalid enum value')
  })

  it('rejects non-string values', () => {
    expect(() => StateName.parse(42)).toThrow('received number')
  })
})

describe('EventLogEntry', () => {
  it('parses entry with required fields', () => {
    const entry = EventLogEntry.parse({ op: 'init', at: '2026-01-01T00:00:00Z' })
    expect(entry.op).toStrictEqual('init')
    expect(entry.at).toStrictEqual('2026-01-01T00:00:00Z')
  })

  it('parses entry with optional detail', () => {
    const entry = EventLogEntry.parse({ op: 'transition', at: '2026-01-01T00:00:00Z', detail: { to: 'PLANNING' } })
    expect(entry.detail).toStrictEqual({ to: 'PLANNING' })
  })

  it('rejects entry missing op', () => {
    expect(() => EventLogEntry.parse({ at: '2026-01-01T00:00:00Z' })).toThrow('Required')
  })
})

describe('WorkflowState', () => {
  it('parses valid minimal state', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, developerDone: false, lintRanIteration: -1,
      userApprovedPlan: false, activeAgents: [], lintedFiles: [], commitsBlocked: false,
      eventLog: [],
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.state).toStrictEqual('SPAWN')
  })

  it('parses state with all optional fields', () => {
    const raw = {
      state: 'DEVELOPING', iteration: 1, developerDone: false, lintRanIteration: 1,
      userApprovedPlan: true, activeAgents: ['dev-1'], lintedFiles: ['foo.ts'],
      commitsBlocked: true, eventLog: [],
      githubIssue: 42, featureBranch: 'feature/foo', developingHeadCommit: 'abc123',
      prNumber: 7, currentIterationTask: 'Iteration 1: Add foo',
      preBlockedState: 'DEVELOPING' as const,
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.githubIssue).toStrictEqual(42)
    expect(parsed.prNumber).toStrictEqual(7)
  })

  it('rejects invalid state name', () => {
    const raw = {
      state: 'INVALID', iteration: 0, developerDone: false, lintRanIteration: -1,
      userApprovedPlan: false, activeAgents: [], lintedFiles: [], commitsBlocked: false,
      eventLog: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('Invalid enum value')
  })

  it('rejects negative iteration', () => {
    const raw = {
      state: 'SPAWN', iteration: -1, developerDone: false, lintRanIteration: -1,
      userApprovedPlan: false, activeAgents: [], lintedFiles: [], commitsBlocked: false,
      eventLog: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than or equal to')
  })

  it('rejects negative githubIssue', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, developerDone: false, lintRanIteration: -1,
      userApprovedPlan: false, activeAgents: [], lintedFiles: [], commitsBlocked: false,
      eventLog: [], githubIssue: -1,
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than 0')
  })
})

describe('INITIAL_STATE', () => {
  it('has SPAWN as initial state', () => {
    expect(INITIAL_STATE.state).toStrictEqual('SPAWN')
  })

  it('has zero iteration', () => {
    expect(INITIAL_STATE.iteration).toStrictEqual(0)
  })

  it('has empty activeAgents and lintedFiles', () => {
    expect(INITIAL_STATE.activeAgents).toStrictEqual([])
    expect(INITIAL_STATE.lintedFiles).toStrictEqual([])
  })

  it('has false for all boolean flags', () => {
    expect(INITIAL_STATE.developerDone).toStrictEqual(false)
    expect(INITIAL_STATE.commitsBlocked).toStrictEqual(false)
    expect(INITIAL_STATE.userApprovedPlan).toStrictEqual(false)
  })
})

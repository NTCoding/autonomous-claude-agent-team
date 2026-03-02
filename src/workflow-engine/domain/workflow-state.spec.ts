import { EventLogEntry, createWorkflowStateSchema } from './workflow-state.js'

const STATE_NAMES = ['SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING',
  'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK', 'BLOCKED', 'COMPLETE'] as const

const StateName = createWorkflowStateSchema(STATE_NAMES).shape.state
const WorkflowState = createWorkflowStateSchema(STATE_NAMES)

describe('createWorkflowStateSchema — StateName', () => {
  it('accepts all valid state names', () => {
    STATE_NAMES.forEach(s => expect(StateName.parse(s)).toStrictEqual(s))
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

describe('createWorkflowStateSchema — WorkflowState', () => {
  it('parses valid minimal state', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      eventLog: [],
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.state).toStrictEqual('SPAWN')
  })

  it('parses state with all optional fields', () => {
    const raw = {
      state: 'DEVELOPING', iteration: 1, iterations: [{
        task: 'Iteration 1: Add foo',
        developerDone: false,
        reviewApproved: false,
        reviewRejected: false,
        coderabbitFeedbackAddressed: false,
        coderabbitFeedbackIgnored: false,
        lintedFiles: ['foo.ts'],
        lintRanIteration: true,
        developingHeadCommit: 'abc123',
      }],
      userApprovedPlan: true, activeAgents: ['dev-1'],
      eventLog: [],
      githubIssue: 42, featureBranch: 'feature/foo',
      prNumber: 7,
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.githubIssue).toStrictEqual(42)
    expect(parsed.prNumber).toStrictEqual(7)
  })

  it('rejects invalid state name', () => {
    const raw = {
      state: 'INVALID', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      eventLog: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('Invalid enum value')
  })

  it('rejects negative iteration', () => {
    const raw = {
      state: 'SPAWN', iteration: -1, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      eventLog: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than or equal to')
  })

  it('rejects negative githubIssue', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      eventLog: [], githubIssue: -1,
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than 0')
  })
})

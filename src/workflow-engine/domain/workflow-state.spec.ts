import { createWorkflowStateSchema } from './workflow-state.js'

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

describe('createWorkflowStateSchema — WorkflowState', () => {
  it('parses valid minimal state', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
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
      githubIssue: 42, featureBranch: 'feature/foo',
      prNumber: 7, preBlockedState: 'DEVELOPING',
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.githubIssue).toStrictEqual(42)
    expect(parsed.prNumber).toStrictEqual(7)
    expect(parsed.preBlockedState).toStrictEqual('DEVELOPING')
  })

  it('rejects invalid state name', () => {
    const raw = {
      state: 'INVALID', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('Invalid enum value')
  })

  it('rejects negative iteration', () => {
    const raw = {
      state: 'SPAWN', iteration: -1, iterations: [],
      userApprovedPlan: false, activeAgents: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than or equal to')
  })

  it('rejects negative githubIssue', () => {
    const raw = {
      state: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      githubIssue: -1,
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than 0')
  })

  it('accepts optional preBlockedState', () => {
    const raw = {
      state: 'BLOCKED', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      preBlockedState: 'PLANNING',
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.preBlockedState).toStrictEqual('PLANNING')
  })
})

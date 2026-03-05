import { createWorkflowStateSchema, StateNameSchema, STATE_NAMES } from './workflow-types.js'

const WorkflowState = createWorkflowStateSchema(STATE_NAMES)

describe('StateNameSchema', () => {
  it('accepts all valid state names', () => {
    STATE_NAMES.forEach(s => expect(StateNameSchema.parse(s)).toStrictEqual(s))
  })

  it('rejects unknown state names', () => {
    expect(() => StateNameSchema.parse('UNKNOWN')).toThrow('Invalid enum value')
  })

  it('rejects non-string values', () => {
    expect(() => StateNameSchema.parse(42)).toThrow('received number')
  })
})

describe('createWorkflowStateSchema — WorkflowState', () => {
  it('parses valid minimal state', () => {
    const raw = {
      currentStateMachineState: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.currentStateMachineState).toStrictEqual('SPAWN')
  })

  it('parses state with all optional fields', () => {
    const raw = {
      currentStateMachineState: 'DEVELOPING', iteration: 1, iterations: [{
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
      currentStateMachineState: 'INVALID', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('Invalid enum value')
  })

  it('rejects negative iteration', () => {
    const raw = {
      currentStateMachineState: 'SPAWN', iteration: -1, iterations: [],
      userApprovedPlan: false, activeAgents: [],
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than or equal to')
  })

  it('rejects negative githubIssue', () => {
    const raw = {
      currentStateMachineState: 'SPAWN', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      githubIssue: -1,
    }
    expect(() => WorkflowState.parse(raw)).toThrow('greater than 0')
  })

  it('accepts optional preBlockedState', () => {
    const raw = {
      currentStateMachineState: 'BLOCKED', iteration: 0, iterations: [],
      userApprovedPlan: false, activeAgents: [],
      preBlockedState: 'PLANNING',
    }
    const parsed = WorkflowState.parse(raw)
    expect(parsed.preBlockedState).toStrictEqual('PLANNING')
  })
})

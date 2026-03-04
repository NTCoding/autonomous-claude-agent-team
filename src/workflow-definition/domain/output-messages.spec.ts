import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { INITIAL_STATE } from './workflow-types.js'
import type { WorkflowState } from '../../workflow-engine/index.js'

function makeState(overrides?: Partial<WorkflowState>): WorkflowState {
  return { ...INITIAL_STATE, ...overrides }
}

describe('getOperationBody', () => {
  it('returns issue number for record-issue', () => {
    const body = getOperationBody('record-issue', makeState({ githubIssue: 42 }))
    expect(body).toContain('#42')
  })

  it('throws when record-issue called without issue', () => {
    expect(() => getOperationBody('record-issue', makeState())).toThrow("Expected 'githubIssue' to be set")
  })

  it('returns branch name for record-branch', () => {
    const body = getOperationBody('record-branch', makeState({ featureBranch: 'feature/x' }))
    expect(body).toContain('feature/x')
  })

  it('throws when record-branch called without branch', () => {
    expect(() => getOperationBody('record-branch', makeState())).toThrow("Expected 'featureBranch' to be set")
  })

  it('returns approval message for record-plan-approval', () => {
    const body = getOperationBody('record-plan-approval', makeState())
    expect(body).toContain('Plan approved')
  })

  it('returns iteration task for assign-iteration-task', () => {
    const state = makeState({
      iterations: [{ task: 'Add foo', developerDone: false, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }],
    })
    const body = getOperationBody('assign-iteration-task', state)
    expect(body).toContain('Add foo')
  })

  it('throws when assign-iteration-task called without iterations', () => {
    expect(() => getOperationBody('assign-iteration-task', makeState())).toThrow("Expected 'current iteration task' to be set")
  })

  it('returns signal-done message', () => {
    const body = getOperationBody('signal-done', makeState())
    expect(body).toContain('Developer signaled completion')
    expect(body).toContain('REVIEWING')
  })

  it('returns pr number for record-pr', () => {
    const body = getOperationBody('record-pr', makeState({ prNumber: 7 }))
    expect(body).toContain('#7')
  })

  it('throws when record-pr called without pr number', () => {
    expect(() => getOperationBody('record-pr', makeState())).toThrow("Expected 'prNumber' to be set")
  })

  it('returns draft pr message for create-pr', () => {
    const body = getOperationBody('create-pr', makeState({ prNumber: 10 }))
    expect(body).toContain('Draft PR #10')
  })

  it('throws when create-pr called without pr number', () => {
    expect(() => getOperationBody('create-pr', makeState())).toThrow("Expected 'prNumber' to be set")
  })

  it('returns checklist message for append-issue-checklist', () => {
    const body = getOperationBody('append-issue-checklist', makeState({ githubIssue: 5 }))
    expect(body).toContain('#5')
  })

  it('returns tick message for tick-iteration', () => {
    const body = getOperationBody('tick-iteration', makeState({ githubIssue: 5 }))
    expect(body).toContain('#5')
  })

  it('throws when append-issue-checklist called without issue', () => {
    expect(() => getOperationBody('append-issue-checklist', makeState())).toThrow("Expected 'githubIssue' to be set")
  })

  it('throws when tick-iteration called without issue', () => {
    expect(() => getOperationBody('tick-iteration', makeState())).toThrow("Expected 'githubIssue' to be set")
  })

  it('returns review-approved message', () => {
    const body = getOperationBody('review-approved', makeState())
    expect(body).toContain('Review approved')
  })

  it('returns review-rejected message', () => {
    const body = getOperationBody('review-rejected', makeState())
    expect(body).toContain('Review rejected')
  })

  it('returns coderabbit-feedback-addressed message', () => {
    const body = getOperationBody('coderabbit-feedback-addressed', makeState())
    expect(body).toContain('addressed')
  })

  it('returns coderabbit-feedback-ignored message', () => {
    const body = getOperationBody('coderabbit-feedback-ignored', makeState())
    expect(body).toContain('ignored')
  })
})

describe('getTransitionTitle', () => {
  it('includes iteration for RESPAWN', () => {
    const title = getTransitionTitle('RESPAWN', makeState({ iteration: 3 }))
    expect(title).toStrictEqual('RESPAWN (iteration: 3)')
  })

  it('includes iteration for DEVELOPING', () => {
    const title = getTransitionTitle('DEVELOPING', makeState({ iteration: 1 }))
    expect(title).toStrictEqual('DEVELOPING (iteration: 1)')
  })

  it('returns plain state name for other states', () => {
    const title = getTransitionTitle('PLANNING', makeState())
    expect(title).toStrictEqual('PLANNING')
  })
})

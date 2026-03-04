import { applyEvents, applyEvent, EMPTY_STATE } from './fold.js'
import type { WorkflowEvent } from './workflow-events.js'
import type { WorkflowState } from '../../workflow-engine/index.js'

const AT = '2026-01-01T00:00:00Z'

function makeState(overrides: Partial<WorkflowState>): WorkflowState {
  return { ...EMPTY_STATE, ...overrides }
}

describe('EMPTY_STATE', () => {
  it('has SPAWN state', () => {
    expect(EMPTY_STATE.state).toStrictEqual('SPAWN')
  })

  it('has zero iteration', () => {
    expect(EMPTY_STATE.iteration).toStrictEqual(0)
  })

  it('has empty iterations array', () => {
    expect(EMPTY_STATE.iterations).toStrictEqual([])
  })

  it('has userApprovedPlan false', () => {
    expect(EMPTY_STATE.userApprovedPlan).toStrictEqual(false)
  })

  it('has empty activeAgents', () => {
    expect(EMPTY_STATE.activeAgents).toStrictEqual([])
  })

  it('has no preBlockedState', () => {
    expect(EMPTY_STATE.preBlockedState).toBeUndefined()
  })
})

describe('applyEvent — session-started', () => {
  it('sets transcriptPath', () => {
    const event: WorkflowEvent = { type: 'session-started', at: AT, transcriptPath: '/t.jsonl' }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.transcriptPath).toStrictEqual('/t.jsonl')
  })

  it('sets transcriptPath to undefined when omitted', () => {
    const event: WorkflowEvent = { type: 'session-started', at: AT }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.transcriptPath).toBeUndefined()
  })
})

describe('applyEvent — issue-recorded', () => {
  it('sets githubIssue', () => {
    const event: WorkflowEvent = { type: 'issue-recorded', at: AT, issueNumber: 42 }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.githubIssue).toStrictEqual(42)
  })
})

describe('applyEvent — branch-recorded', () => {
  it('sets featureBranch', () => {
    const event: WorkflowEvent = { type: 'branch-recorded', at: AT, branch: 'feature/x' }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.featureBranch).toStrictEqual('feature/x')
  })
})

describe('applyEvent — plan-approval-recorded', () => {
  it('sets userApprovedPlan to true', () => {
    const event: WorkflowEvent = { type: 'plan-approval-recorded', at: AT }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.userApprovedPlan).toStrictEqual(true)
  })
})

describe('applyEvent — iteration-task-assigned', () => {
  it('appends a new iteration', () => {
    const event: WorkflowEvent = { type: 'iteration-task-assigned', at: AT, task: 'Build feature' }
    const result = applyEvent(EMPTY_STATE, event)
    expect(result.iterations).toHaveLength(1)
    expect(result.iterations[0]?.task).toStrictEqual('Build feature')
    expect(result.iterations[0]?.developerDone).toStrictEqual(false)
    expect(result.iterations[0]?.lintedFiles).toStrictEqual([])
  })
})

describe('applyEvent — developer-done-signaled', () => {
  it('sets developerDone on current iteration', () => {
    const state = makeState({
      iterations: [{ task: 't', developerDone: false, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }],
    })
    const event: WorkflowEvent = { type: 'developer-done-signaled', at: AT }
    const result = applyEvent(state, event)
    expect(result.iterations[0]?.developerDone).toStrictEqual(true)
  })

  it('only updates current iteration', () => {
    const iter = { task: 't', developerDone: false, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }
    const state = makeState({ iteration: 1, iterations: [iter, iter] })
    const event: WorkflowEvent = { type: 'developer-done-signaled', at: AT }
    const result = applyEvent(state, event)
    expect(result.iterations[0]?.developerDone).toStrictEqual(false)
    expect(result.iterations[1]?.developerDone).toStrictEqual(true)
  })
})

describe('applyEvent — pr-recorded / pr-created', () => {
  it('pr-recorded sets prNumber', () => {
    const event: WorkflowEvent = { type: 'pr-recorded', at: AT, prNumber: 7 }
    expect(applyEvent(EMPTY_STATE, event).prNumber).toStrictEqual(7)
  })

  it('pr-created sets prNumber', () => {
    const event: WorkflowEvent = { type: 'pr-created', at: AT, prNumber: 8 }
    expect(applyEvent(EMPTY_STATE, event).prNumber).toStrictEqual(8)
  })
})

describe('applyEvent — review-approved / review-rejected', () => {
  const iter = { task: 't', developerDone: true, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }

  it('review-approved sets reviewApproved', () => {
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'review-approved', at: AT })
    expect(result.iterations[0]?.reviewApproved).toStrictEqual(true)
  })

  it('review-rejected sets reviewRejected', () => {
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'review-rejected', at: AT })
    expect(result.iterations[0]?.reviewRejected).toStrictEqual(true)
  })
})

describe('applyEvent — coderabbit-addressed / coderabbit-ignored', () => {
  const iter = { task: 't', developerDone: false, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }

  it('coderabbit-addressed sets coderabbitFeedbackAddressed', () => {
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'coderabbit-addressed', at: AT })
    expect(result.iterations[0]?.coderabbitFeedbackAddressed).toStrictEqual(true)
  })

  it('coderabbit-ignored sets coderabbitFeedbackIgnored', () => {
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'coderabbit-ignored', at: AT })
    expect(result.iterations[0]?.coderabbitFeedbackIgnored).toStrictEqual(true)
  })
})

describe('applyEvent — lint-ran', () => {
  const iter = { task: 't', developerDone: false, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: [], lintRanIteration: false }

  it('sets lintRanIteration and lintedFiles when files provided', () => {
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'lint-ran', at: AT, files: 2, passed: true, lintedFiles: ['a.ts', 'b.ts'] })
    expect(result.iterations[0]?.lintRanIteration).toStrictEqual(true)
    expect(result.iterations[0]?.lintedFiles).toStrictEqual(['a.ts', 'b.ts'])
  })

  it('merges with existing lintedFiles and deduplicates', () => {
    const state = makeState({ iterations: [{ ...iter, lintedFiles: ['a.ts'] }] })
    const result = applyEvent(state, { type: 'lint-ran', at: AT, files: 2, passed: true, lintedFiles: ['a.ts', 'b.ts'] })
    expect(result.iterations[0]?.lintedFiles).toStrictEqual(['a.ts', 'b.ts'])
  })

  it('sets lintRanIteration without changing files when lintedFiles absent', () => {
    const state = makeState({ iterations: [{ ...iter, lintedFiles: ['existing.ts'] }] })
    const result = applyEvent(state, { type: 'lint-ran', at: AT, files: 0, passed: true })
    expect(result.iterations[0]?.lintRanIteration).toStrictEqual(true)
    expect(result.iterations[0]?.lintedFiles).toStrictEqual(['existing.ts'])
  })

  it('handles missing iteration entry gracefully', () => {
    const state = makeState({ iteration: 0, iterations: [] })
    const result = applyEvent(state, { type: 'lint-ran', at: AT, files: 1, passed: true, lintedFiles: ['a.ts'] })
    expect(result.iterations).toHaveLength(0)
  })
})

describe('applyEvent — agent-registered', () => {
  it('adds agentType to activeAgents', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'agent-registered', at: AT, agentType: 'developer-1', agentId: 'agt-1' })
    expect(result.activeAgents).toStrictEqual(['developer-1'])
  })

  it('does not duplicate if already present', () => {
    const state = makeState({ activeAgents: ['developer-1'] })
    const result = applyEvent(state, { type: 'agent-registered', at: AT, agentType: 'developer-1', agentId: 'agt-2' })
    expect(result.activeAgents).toStrictEqual(['developer-1'])
  })
})

describe('applyEvent — agent-shut-down', () => {
  it('removes agentName from activeAgents', () => {
    const state = makeState({ activeAgents: ['developer-1', 'reviewer-1'] })
    const result = applyEvent(state, { type: 'agent-shut-down', at: AT, agentName: 'developer-1' })
    expect(result.activeAgents).toStrictEqual(['reviewer-1'])
  })

  it('leaves state unchanged if agent not present', () => {
    const state = makeState({ activeAgents: ['reviewer-1'] })
    const result = applyEvent(state, { type: 'agent-shut-down', at: AT, agentName: 'unknown' })
    expect(result.activeAgents).toStrictEqual(['reviewer-1'])
  })
})

describe('applyEvent — transitioned', () => {
  it('changes state field', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'transitioned', at: AT, from: 'SPAWN', to: 'PLANNING' })
    expect(result.state).toStrictEqual('PLANNING')
  })

  it('sets preBlockedState when transitioning to BLOCKED', () => {
    const result = applyEvent(makeState({ state: 'DEVELOPING' }), { type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'BLOCKED' })
    expect(result.preBlockedState).toStrictEqual('DEVELOPING')
    expect(result.state).toStrictEqual('BLOCKED')
  })

  it('clears preBlockedState when transitioning away from BLOCKED', () => {
    const state = makeState({ state: 'BLOCKED', preBlockedState: 'DEVELOPING' })
    const result = applyEvent(state, { type: 'transitioned', at: AT, from: 'BLOCKED', to: 'DEVELOPING' })
    expect(result.preBlockedState).toBeUndefined()
    expect(result.state).toStrictEqual('DEVELOPING')
  })

  it('applies fat iteration field when provided', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'transitioned', at: AT, from: 'SPAWN', to: 'DEVELOPING', iteration: 2 })
    expect(result.iteration).toStrictEqual(2)
  })

  it('keeps existing iteration when not provided', () => {
    const state = makeState({ iteration: 1 })
    const result = applyEvent(state, { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING' })
    expect(result.iteration).toStrictEqual(1)
  })

  it('applies DEVELOPING onEntry fields when developingHeadCommit provided', () => {
    const iter = { task: 't', developerDone: true, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: ['a.ts'], lintRanIteration: true }
    const state = makeState({ iterations: [iter] })
    const result = applyEvent(state, { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING', developingHeadCommit: 'abc123' })
    expect(result.iterations[0]?.developerDone).toStrictEqual(false)
    expect(result.iterations[0]?.developingHeadCommit).toStrictEqual('abc123')
    expect(result.iterations[0]?.lintedFiles).toStrictEqual([])
    expect(result.iterations[0]?.lintRanIteration).toStrictEqual(false)
  })

  it('does not apply DEVELOPING fields for other target states', () => {
    const iter = { task: 't', developerDone: true, reviewApproved: false, reviewRejected: false, coderabbitFeedbackAddressed: false, coderabbitFeedbackIgnored: false, lintedFiles: ['a.ts'], lintRanIteration: true }
    const state = makeState({ state: 'DEVELOPING', iterations: [iter] })
    const result = applyEvent(state, { type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'REVIEWING' })
    expect(result.iterations[0]?.developerDone).toStrictEqual(true)
    expect(result.iterations[0]?.lintedFiles).toStrictEqual(['a.ts'])
  })
})

describe('applyEvent — observation events return unchanged state', () => {
  it('idle-checked returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'idle-checked', at: AT, agentName: 'lead', allowed: true })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('write-checked returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'write-checked', at: AT, tool: 'Write', filePath: '/f', allowed: true })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('bash-checked returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'bash-checked', at: AT, tool: 'Bash', command: 'ls', allowed: true })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('plugin-read-checked returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'plugin-read-checked', at: AT, tool: 'Read', path: '/p', allowed: true })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('identity-verified returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'identity-verified', at: AT, status: 'ok', transcriptPath: '/t' })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('context-requested returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'context-requested', at: AT, agentName: 'lead' })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('journal-entry returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'journal-entry', at: AT, agentName: 'lead', content: 'note' })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('issue-checklist-appended returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'issue-checklist-appended', at: AT, issueNumber: 1 })
    expect(result).toStrictEqual(EMPTY_STATE)
  })

  it('iteration-ticked returns state unchanged', () => {
    const result = applyEvent(EMPTY_STATE, { type: 'iteration-ticked', at: AT, issueNumber: 1 })
    expect(result).toStrictEqual(EMPTY_STATE)
  })
})

describe('applyEvents', () => {
  it('returns EMPTY_STATE for empty event sequence', () => {
    expect(applyEvents([])).toStrictEqual(EMPTY_STATE)
  })

  it('reduces a full event sequence to correct state', () => {
    const events: WorkflowEvent[] = [
      { type: 'session-started', at: AT, transcriptPath: '/t.jsonl' },
      { type: 'issue-recorded', at: AT, issueNumber: 10 },
      { type: 'branch-recorded', at: AT, branch: 'feature/foo' },
      { type: 'transitioned', at: AT, from: 'SPAWN', to: 'PLANNING' },
      { type: 'plan-approval-recorded', at: AT },
      { type: 'transitioned', at: AT, from: 'PLANNING', to: 'RESPAWN' },
      { type: 'iteration-task-assigned', at: AT, task: 'Build it' },
      { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING', iteration: 0, developingHeadCommit: 'abc' },
    ]
    const state = applyEvents(events)
    expect(state.state).toStrictEqual('DEVELOPING')
    expect(state.githubIssue).toStrictEqual(10)
    expect(state.featureBranch).toStrictEqual('feature/foo')
    expect(state.userApprovedPlan).toStrictEqual(true)
  })

  it('applies iteration and transcript path from event sequence', () => {
    const events: WorkflowEvent[] = [
      { type: 'session-started', at: AT, transcriptPath: '/t.jsonl' },
      { type: 'iteration-task-assigned', at: AT, task: 'Build it' },
      { type: 'transitioned', at: AT, from: 'RESPAWN', to: 'DEVELOPING', iteration: 0, developingHeadCommit: 'abc' },
    ]
    const state = applyEvents(events)
    expect(state.iterations[0]?.task).toStrictEqual('Build it')
    expect(state.iterations[0]?.developingHeadCommit).toStrictEqual('abc')
    expect(state.transcriptPath).toStrictEqual('/t.jsonl')
  })

  it('handles BLOCKED/unblock round trip correctly', () => {
    const events: WorkflowEvent[] = [
      { type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'BLOCKED' },
      { type: 'transitioned', at: AT, from: 'BLOCKED', to: 'DEVELOPING' },
    ]
    const state = applyEvents(events)
    expect(state.state).toStrictEqual('DEVELOPING')
    expect(state.preBlockedState).toBeUndefined()
  })

  it('preserves preBlockedState in BLOCKED state', () => {
    const events: WorkflowEvent[] = [
      { type: 'transitioned', at: AT, from: 'PLANNING', to: 'BLOCKED' },
    ]
    const state = applyEvents(events)
    expect(state.preBlockedState).toStrictEqual('PLANNING')
  })
})

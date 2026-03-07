import type { WorkflowEvent, StateName } from '../workflow-definition/index.js'
import {
  categorizeEvent,
  extractStructuredFields,
  annotateEventsWithState,
  annotateEventsWithIteration,
  extractOutcome,
} from './event-display.js'
import type { EventCategory, AnnotatedEvent } from './event-display.js'

function transition(at: string, from: StateName, to: StateName): WorkflowEvent {
  return { type: 'transitioned' as const, at, from, to }
}

function taskAssigned(at: string, task: string): WorkflowEvent {
  return { type: 'iteration-task-assigned' as const, at, task }
}

describe('categorizeEvent', () => {
  it.each<[WorkflowEvent['type'], EventCategory]>([
    ['transitioned', 'transition'],
    ['session-started', 'milestone'],
    ['issue-recorded', 'milestone'],
    ['branch-recorded', 'milestone'],
    ['plan-approval-recorded', 'milestone'],
    ['pr-created', 'milestone'],
    ['pr-recorded', 'milestone'],
    ['iteration-task-assigned', 'devcycle'],
    ['developer-done-signaled', 'devcycle'],
    ['iteration-ticked', 'devcycle'],
    ['issue-checklist-appended', 'devcycle'],
    ['review-approved', 'review'],
    ['review-rejected', 'review'],
    ['coderabbit-addressed', 'review'],
    ['coderabbit-ignored', 'review'],
    ['write-checked', 'permission'],
    ['bash-checked', 'permission'],
    ['plugin-read-checked', 'permission'],
    ['idle-checked', 'permission'],
    ['agent-registered', 'agent'],
    ['agent-shut-down', 'agent'],
    ['identity-verified', 'agent'],
    ['context-requested', 'agent'],
    ['journal-entry', 'journal'],
    ['lint-ran', 'quality'],
  ])('returns %s → %s', (eventType, expectedCategory) => {
    expect(categorizeEvent({ type: eventType })).toStrictEqual(expectedCategory)
  })
})

describe('extractStructuredFields', () => {
  it('extracts from/to/iteration for transitioned events', () => {
    const event: WorkflowEvent = { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'SPAWN', to: 'PLANNING', iteration: 2 }
    const fields = extractStructuredFields(event)
    expect(fields).toStrictEqual({ from: 'SPAWN', to: 'PLANNING', iteration: 2 })
  })

  it('omits iteration from transitioned when not present', () => {
    const event: WorkflowEvent = transition('2026-01-01T00:00:00.000Z', 'SPAWN', 'PLANNING')
    const fields = extractStructuredFields(event)
    expect(fields).toStrictEqual({ from: 'SPAWN', to: 'PLANNING' })
  })

  it('includes preBlockedState for transitioned when present', () => {
    const event: WorkflowEvent = { type: 'transitioned' as const, at: '2026-01-01T00:00:00.000Z', from: 'DEVELOPING', to: 'BLOCKED', preBlockedState: 'DEVELOPING' }
    expect(extractStructuredFields(event)).toStrictEqual({ from: 'DEVELOPING', to: 'BLOCKED', preBlockedState: 'DEVELOPING' })
  })

  it('extracts transcriptPath for session-started', () => {
    const event: WorkflowEvent = { type: 'session-started' as const, at: '2026-01-01T00:00:00.000Z', transcriptPath: '/tmp/t.jsonl' }
    expect(extractStructuredFields(event)).toStrictEqual({ transcriptPath: '/tmp/t.jsonl' })
  })

  it('returns empty object for session-started when no transcriptPath', () => {
    const event: WorkflowEvent = { type: 'session-started' as const, at: '2026-01-01T00:00:00.000Z' }
    expect(extractStructuredFields(event)).toStrictEqual({})
  })

  it('extracts issueNumber for issue-recorded', () => {
    const event: WorkflowEvent = { type: 'issue-recorded' as const, at: '2026-01-01T00:00:00.000Z', issueNumber: 42 }
    expect(extractStructuredFields(event)).toStrictEqual({ issueNumber: 42 })
  })

  it('extracts branch for branch-recorded', () => {
    const event: WorkflowEvent = { type: 'branch-recorded' as const, at: '2026-01-01T00:00:00.000Z', branch: 'feature/x' }
    expect(extractStructuredFields(event)).toStrictEqual({ branch: 'feature/x' })
  })

  it('extracts task for iteration-task-assigned', () => {
    const event: WorkflowEvent = taskAssigned('2026-01-01T00:00:00.000Z', 'Implement auth')
    expect(extractStructuredFields(event)).toStrictEqual({ task: 'Implement auth' })
  })

  it('extracts prNumber for pr-created', () => {
    const event: WorkflowEvent = { type: 'pr-created' as const, at: '2026-01-01T00:00:00.000Z', prNumber: 99 }
    expect(extractStructuredFields(event)).toStrictEqual({ prNumber: 99 })
  })

  it('extracts prNumber for pr-recorded', () => {
    const event: WorkflowEvent = { type: 'pr-recorded' as const, at: '2026-01-01T00:00:00.000Z', prNumber: 77 }
    expect(extractStructuredFields(event)).toStrictEqual({ prNumber: 77 })
  })

  it('extracts tool/filePath/allowed/reason for write-checked', () => {
    const event: WorkflowEvent = { type: 'write-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Write', filePath: 'src/x.ts', allowed: false, reason: 'scope' }
    expect(extractStructuredFields(event)).toStrictEqual({ tool: 'Write', filePath: 'src/x.ts', allowed: false, reason: 'scope' })
  })

  it('extracts tool/command/allowed/reason for bash-checked', () => {
    const event: WorkflowEvent = { type: 'bash-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Bash', command: 'rm -rf /', allowed: false, reason: 'blocked' }
    expect(extractStructuredFields(event)).toStrictEqual({ tool: 'Bash', command: 'rm -rf /', allowed: false, reason: 'blocked' })
  })

  it('extracts tool/path/allowed/reason for plugin-read-checked', () => {
    const event: WorkflowEvent = { type: 'plugin-read-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Read', path: '/etc', allowed: true }
    expect(extractStructuredFields(event)).toStrictEqual({ tool: 'Read', path: '/etc', allowed: true })
  })

  it('extracts agentName/allowed/reason for idle-checked', () => {
    const event: WorkflowEvent = { type: 'idle-checked' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'dev', allowed: false, reason: 'busy' }
    expect(extractStructuredFields(event)).toStrictEqual({ agentName: 'dev', allowed: false, reason: 'busy' })
  })

  it('extracts agentType/agentId for agent-registered', () => {
    const event: WorkflowEvent = { type: 'agent-registered' as const, at: '2026-01-01T00:00:00.000Z', agentType: 'developer', agentId: 'dev-1' }
    expect(extractStructuredFields(event)).toStrictEqual({ agentType: 'developer', agentId: 'dev-1' })
  })

  it('extracts agentName for agent-shut-down', () => {
    const event: WorkflowEvent = { type: 'agent-shut-down' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'dev' }
    expect(extractStructuredFields(event)).toStrictEqual({ agentName: 'dev' })
  })

  it('extracts status/transcriptPath for identity-verified', () => {
    const event: WorkflowEvent = { type: 'identity-verified' as const, at: '2026-01-01T00:00:00.000Z', status: 'verified', transcriptPath: '/tmp/t' }
    expect(extractStructuredFields(event)).toStrictEqual({ status: 'verified', transcriptPath: '/tmp/t' })
  })

  it('extracts agentName for context-requested', () => {
    const event: WorkflowEvent = { type: 'context-requested' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'lead' }
    expect(extractStructuredFields(event)).toStrictEqual({ agentName: 'lead' })
  })

  it('extracts agentName/content for journal-entry', () => {
    const event: WorkflowEvent = { type: 'journal-entry' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'dev', content: 'Working on auth' }
    expect(extractStructuredFields(event)).toStrictEqual({ agentName: 'dev', content: 'Working on auth' })
  })

  it('extracts files/passed for lint-ran', () => {
    const event: WorkflowEvent = { type: 'lint-ran' as const, at: '2026-01-01T00:00:00.000Z', files: 5, passed: true }
    expect(extractStructuredFields(event)).toStrictEqual({ files: 5, passed: true })
  })

  it('extracts issueNumber for issue-checklist-appended', () => {
    const event: WorkflowEvent = { type: 'issue-checklist-appended' as const, at: '2026-01-01T00:00:00.000Z', issueNumber: 42 }
    expect(extractStructuredFields(event)).toStrictEqual({ issueNumber: 42 })
  })

  it('extracts issueNumber for iteration-ticked', () => {
    const event: WorkflowEvent = { type: 'iteration-ticked' as const, at: '2026-01-01T00:00:00.000Z', issueNumber: 42 }
    expect(extractStructuredFields(event)).toStrictEqual({ issueNumber: 42 })
  })

  it('returns empty object for events with no extra fields', () => {
    const event: WorkflowEvent = { type: 'review-approved' as const, at: '2026-01-01T00:00:00.000Z' }
    expect(extractStructuredFields(event)).toStrictEqual({})
  })

  it('returns empty object for plan-approval-recorded', () => {
    expect(extractStructuredFields({ type: 'plan-approval-recorded' as const, at: '2026-01-01T00:00:00.000Z' })).toStrictEqual({})
  })

  it('returns empty object for developer-done-signaled', () => {
    expect(extractStructuredFields({ type: 'developer-done-signaled' as const, at: '2026-01-01T00:00:00.000Z' })).toStrictEqual({})
  })

  it('returns empty object for coderabbit-addressed', () => {
    expect(extractStructuredFields({ type: 'coderabbit-addressed' as const, at: '2026-01-01T00:00:00.000Z' })).toStrictEqual({})
  })

  it('returns empty object for coderabbit-ignored', () => {
    expect(extractStructuredFields({ type: 'coderabbit-ignored' as const, at: '2026-01-01T00:00:00.000Z' })).toStrictEqual({})
  })
})

describe('extractOutcome', () => {
  it('returns denied for write-checked with allowed=false', () => {
    const event: WorkflowEvent = { type: 'write-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Write', filePath: 'x', allowed: false }
    expect(extractOutcome(event)).toStrictEqual('denied')
  })

  it('returns undefined for write-checked with allowed=true', () => {
    const event: WorkflowEvent = { type: 'write-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Write', filePath: 'x', allowed: true }
    expect(extractOutcome(event)).toBeUndefined()
  })

  it('returns denied for bash-checked with allowed=false', () => {
    const event: WorkflowEvent = { type: 'bash-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Bash', command: 'x', allowed: false }
    expect(extractOutcome(event)).toStrictEqual('denied')
  })

  it('returns rejected for review-rejected', () => {
    const event: WorkflowEvent = { type: 'review-rejected' as const, at: '2026-01-01T00:00:00.000Z' }
    expect(extractOutcome(event)).toStrictEqual('rejected')
  })

  it('returns approved for review-approved', () => {
    const event: WorkflowEvent = { type: 'review-approved' as const, at: '2026-01-01T00:00:00.000Z' }
    expect(extractOutcome(event)).toStrictEqual('approved')
  })

  it('returns undefined for events without outcomes', () => {
    const event: WorkflowEvent = { type: 'journal-entry' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'x', content: 'y' }
    expect(extractOutcome(event)).toBeUndefined()
  })

  it('returns denied for plugin-read-checked with allowed=false', () => {
    const event: WorkflowEvent = { type: 'plugin-read-checked' as const, at: '2026-01-01T00:00:00.000Z', tool: 'Read', path: 'x', allowed: false }
    expect(extractOutcome(event)).toStrictEqual('denied')
  })

  it('returns denied for idle-checked with allowed=false', () => {
    const event: WorkflowEvent = { type: 'idle-checked' as const, at: '2026-01-01T00:00:00.000Z', agentName: 'x', allowed: false }
    expect(extractOutcome(event)).toStrictEqual('denied')
  })
})

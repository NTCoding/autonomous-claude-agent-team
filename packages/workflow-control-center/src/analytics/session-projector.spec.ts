import { describe, it, expect } from 'vitest'
import {
  projectSession,
  projectSessionSummary,
  createProjectionCache,
} from './session-projector.js'
import type { ParsedEvent } from '../query/query-types.js'

const WORKFLOW_STATES = ['SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING', 'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK', 'BLOCKED', 'COMPLETE']

function makeEvents(sessionId: string): ReadonlyArray<ParsedEvent> {
  return [
    { seq: 1, sessionId, type: 'session-started', at: '2026-01-01T00:00:00Z', payload: { repository: 'test/repo', currentState: 'SPAWN', states: WORKFLOW_STATES } },
    { seq: 2, sessionId, type: 'transitioned', at: '2026-01-01T00:01:00Z', payload: { from: 'idle', to: 'SPAWN' } },
    { seq: 3, sessionId, type: 'agent-registered', at: '2026-01-01T00:02:00Z', payload: { agentType: 'lead', agentId: 'lead-1' } },
    { seq: 4, sessionId, type: 'transitioned', at: '2026-01-01T00:05:00Z', payload: { from: 'SPAWN', to: 'PLANNING' } },
    { seq: 5, sessionId, type: 'journal-entry', at: '2026-01-01T00:06:00Z', payload: { agentName: 'lead-1', content: 'Starting plan' } },
    { seq: 6, sessionId, type: 'write-checked', at: '2026-01-01T00:07:00Z', payload: { allowed: false, tool: 'Write', filePath: '/test.ts' } },
    { seq: 7, sessionId, type: 'transitioned', at: '2026-01-01T00:10:00Z', payload: { from: 'PLANNING', to: 'DEVELOPING' } },
    { seq: 8, sessionId, type: 'agent-shut-down', at: '2026-01-01T00:11:00Z', payload: { agentName: 'lead-1' } },
  ]
}

describe('projectSession', () => {
  it('computes correct current state', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.currentState).toBe('DEVELOPING')
  })

  it('counts events correctly', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.totalEvents).toBe(8)
  })

  it('tracks transitions', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.transitionCount).toBe(3)
  })

  it('tracks agents', () => {
    const events = makeEvents('s1').slice(0, 3)
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual(['lead-1'])
  })

  it('removes shut-down agents', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.activeAgents).toEqual([])
  })

  it('counts permission denials', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.permissionDenials.write).toBe(1)
    expect(projection.permissionDenials.bash).toBe(0)
  })

  it('counts plugin-read-checked denials', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'plugin-read-checked', at: '2026-01-01T00:00:00Z', payload: { allowed: false, tool: 'Read', path: '/plugin' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.permissionDenials.pluginRead).toBe(1)
  })

  it('counts idle-checked denials', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'idle-checked', at: '2026-01-01T00:00:00Z', payload: { allowed: false, agentName: 'dev' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.permissionDenials.idle).toBe(1)
  })

  it('counts bash-checked denials', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'bash-checked', at: '2026-01-01T00:00:00Z', payload: { allowed: false, tool: 'Bash', command: 'git push' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.permissionDenials.bash).toBe(1)
  })

  it('does not count allowed permission events as denials', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'plugin-read-checked', at: '2026-01-01T00:00:00Z', payload: { allowed: true, tool: 'Read', path: '/file' } },
      { seq: 2, sessionId: 's1', type: 'idle-checked', at: '2026-01-01T00:01:00Z', payload: { allowed: true, agentName: 'dev' } },
      { seq: 3, sessionId: 's1', type: 'bash-checked', at: '2026-01-01T00:02:00Z', payload: { allowed: true, tool: 'Bash', command: 'echo hi' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.permissionDenials.pluginRead).toBe(0)
    expect(projection.permissionDenials.idle).toBe(0)
    expect(projection.permissionDenials.bash).toBe(0)
  })

  it('ignores duplicate agent registrations', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'agent-registered', at: '2026-01-01T00:00:00Z', payload: { agentType: 'lead', agentId: 'lead-1' } },
      { seq: 2, sessionId: 's1', type: 'agent-registered', at: '2026-01-01T00:01:00Z', payload: { agentType: 'lead', agentId: 'lead-1' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual(['lead-1'])
  })

  it('handles session-started without repository', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'session-started', at: '2026-01-01T00:00:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.repository).toBeUndefined()
  })

  it('handles session-started with empty repository string', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'session-started', at: '2026-01-01T00:00:00Z', payload: { repository: '' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.repository).toBeUndefined()
  })

  it('does not remove agent not in active list', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'agent-shut-down', at: '2026-01-01T00:00:00Z', payload: { agentName: 'nonexistent' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual([])
  })

  it('handles agent-registered with empty agentId', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'agent-registered', at: '2026-01-01T00:00:00Z', payload: { agentType: 'lead', agentId: '' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual([])
  })

  it('handles transition without preceding state period', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:01:00Z', payload: { from: 'idle', to: 'SPAWN' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.statePeriods).toHaveLength(1)
    expect(projection.statePeriods[0]?.state).toBe('SPAWN')
  })

  it('skips malformed transitioned event (missing required fields)', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:00:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.currentState).toBe('initial state')
    expect(projection.transitionCount).toBe(0)
    expect(projection.totalEvents).toBe(1)
  })

  it('skips malformed agent-registered (missing required fields)', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'agent-registered', at: '2026-01-01T00:00:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual([])
    expect(projection.totalEvents).toBe(1)
  })

  it('skips malformed agent-shut-down (missing required fields)', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'agent-shut-down', at: '2026-01-01T00:00:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.activeAgents).toEqual([])
    expect(projection.totalEvents).toBe(1)
  })

  it('skips malformed journal-entry (missing required fields)', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'journal-entry', at: '2026-01-01T00:00:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.journalEntries).toHaveLength(0)
    expect(projection.journalEntryCount).toBe(0)
    expect(projection.totalEvents).toBe(1)
  })

  it('tracks unknown event types without crashing', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'custom-domain-event', at: '2026-01-01T00:00:00Z', payload: { foo: 'bar' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.totalEvents).toBe(1)
  })

  it('collects journal entries with state context', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.journalEntries).toHaveLength(1)
    expect(projection.journalEntries[0]?.agentName).toBe('lead-1')
    expect(projection.journalEntries[0]?.state).toBe('PLANNING')
  })

  it('records state periods', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.statePeriods.length).toBe(3)
    expect(projection.statePeriods[0]?.state).toBe('SPAWN')
  })

  it('records repository from session-started', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    expect(projection.repository).toBe('test/repo')
  })

  it('records current state and workflow states from session-started', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'session-started', at: '2026-01-01T00:00:00Z', payload: { currentState: 'SPAWN', states: WORKFLOW_STATES } },
      { seq: 2, sessionId: 's1', type: 'write-checked', at: '2026-01-01T00:01:00Z', payload: { allowed: true, tool: 'Write', filePath: '/tmp/test.ts' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.currentState).toBe('SPAWN')
    expect(projection.workflowStates).toEqual(WORKFLOW_STATES)
  })

  it('handles empty events', () => {
    const projection = projectSession('s1', [])
    expect(projection.currentState).toBe('initial state')
    expect(projection.totalEvents).toBe(0)
  })

  it('adds initial state period when no transitions are recorded', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'session-started', at: '2026-01-01T00:00:00Z', payload: { repository: 'test/repo', currentState: 'SPAWN', states: WORKFLOW_STATES } },
      { seq: 2, sessionId: 's1', type: 'write-checked', at: '2026-01-01T00:05:00Z', payload: { allowed: true, tool: 'Read', filePath: '/tmp' } },
    ]

    const projection = projectSession('s1', events)
    expect(projection.transitionCount).toBe(0)
    expect(projection.statePeriods).toHaveLength(1)
    expect(projection.statePeriods[0]?.state).toBe('SPAWN')
    expect((projection.statePeriods[0]?.durationMs ?? 0) > 0).toBe(true)
  })

  it('extracts issueNumber from issue-recorded event', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'issue-recorded', at: '2026-01-01T00:00:00Z', payload: { issueNumber: 42 } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.issueNumber).toBe(42)
    expect(projection.totalEvents).toBe(1)
  })

  it('extracts featureBranch from branch-recorded event', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'branch-recorded', at: '2026-01-01T00:00:00Z', payload: { branch: 'feat/login' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.featureBranch).toBe('feat/login')
    expect(projection.totalEvents).toBe(1)
  })

  it('extracts prNumber from pr-recorded event', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'pr-recorded', at: '2026-01-01T00:00:00Z', payload: { prNumber: 99 } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.prNumber).toBe(99)
    expect(projection.totalEvents).toBe(1)
  })

  it('skips malformed domain metadata events', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'issue-recorded', at: '2026-01-01T00:00:00Z', payload: {} },
      { seq: 2, sessionId: 's1', type: 'branch-recorded', at: '2026-01-01T00:01:00Z', payload: {} },
      { seq: 3, sessionId: 's1', type: 'pr-recorded', at: '2026-01-01T00:02:00Z', payload: {} },
    ]
    const projection = projectSession('s1', events)
    expect(projection.issueNumber).toBeUndefined()
    expect(projection.featureBranch).toBeUndefined()
    expect(projection.prNumber).toBeUndefined()
    expect(projection.totalEvents).toBe(3)
  })

  it('combines engine and domain metadata events', () => {
    const events: ReadonlyArray<ParsedEvent> = [
      { seq: 1, sessionId: 's1', type: 'session-started', at: '2026-01-01T00:00:00Z', payload: { repository: 'org/repo' } },
      { seq: 2, sessionId: 's1', type: 'issue-recorded', at: '2026-01-01T00:01:00Z', payload: { issueNumber: 7 } },
      { seq: 3, sessionId: 's1', type: 'branch-recorded', at: '2026-01-01T00:02:00Z', payload: { branch: 'feat/thing' } },
      { seq: 4, sessionId: 's1', type: 'pr-recorded', at: '2026-01-01T00:03:00Z', payload: { prNumber: 15 } },
      { seq: 5, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:04:00Z', payload: { from: 'idle', to: 'SPAWN' } },
    ]
    const projection = projectSession('s1', events)
    expect(projection.repository).toBe('org/repo')
    expect(projection.issueNumber).toBe(7)
    expect(projection.featureBranch).toBe('feat/thing')
    expect(projection.prNumber).toBe(15)
    expect(projection.currentState).toBe('SPAWN')
    expect(projection.totalEvents).toBe(5)
  })
})

describe('projectSessionSummary', () => {
  it('computes duration from first to last event', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    const now = new Date('2026-01-01T00:05:00Z')
    const summary = projectSessionSummary(projection, now)
    expect(summary.durationMs).toBe(11 * 60 * 1000)
  })

  it('determines session status based on time', () => {
    const projection = projectSession('s1', makeEvents('s1'))
    const recentNow = new Date('2026-01-01T00:20:00Z')
    expect(projectSessionSummary(projection, recentNow).status).toBe('active')

    const staleNow = new Date('2026-01-01T02:00:00Z')
    expect(projectSessionSummary(projection, staleNow).status).toBe('stale')
  })

  it('returns completed for empty projections', () => {
    const projection = projectSession('s1', [])
    const summary = projectSessionSummary(projection, new Date())
    expect(summary.status).toBe('completed')
    expect(summary.durationMs).toBe(0)
  })
})

describe('createProjectionCache', () => {
  it('starts empty', () => {
    const cache = createProjectionCache()
    expect(cache.size()).toBe(0)
    expect(cache.get('nonexistent')).toBeUndefined()
  })

  it('stores and retrieves projections', () => {
    const cache = createProjectionCache()
    const projection = projectSession('s1', makeEvents('s1'))
    cache.set('s1', projection)
    expect(cache.size()).toBe(1)
    expect(cache.get('s1')?.currentState).toBe('DEVELOPING')
  })

  it('applies events incrementally to existing', () => {
    const cache = createProjectionCache()
    const projection = projectSession('s1', makeEvents('s1'))
    cache.set('s1', projection)

    const newEvent: ParsedEvent = {
      seq: 9, sessionId: 's1', type: 'transitioned', at: '2026-01-01T00:15:00Z',
      payload: { from: 'DEVELOPING', to: 'REVIEWING' },
    }
    const updated = cache.applyEvent(newEvent)
    expect(updated.currentState).toBe('REVIEWING')
    expect(updated.transitionCount).toBe(4)
  })

  it('creates new projection for unknown session', () => {
    const cache = createProjectionCache()
    const event: ParsedEvent = {
      seq: 1, sessionId: 'new-session', type: 'session-started', at: '2026-01-01T00:00:00Z',
      payload: { repository: 'test/repo' },
    }
    const projection = cache.applyEvent(event)
    expect(projection.sessionId).toBe('new-session')
    expect(cache.size()).toBe(1)
  })

  it('evicts stale projections', () => {
    const cache = createProjectionCache()
    const projection = projectSession('s1', makeEvents('s1'))
    cache.set('s1', projection)

    const futureNow = new Date('2026-01-02T00:00:00Z')
    const evicted = cache.evictStale(futureNow)
    expect(evicted).toBe(1)
    expect(cache.size()).toBe(0)
  })

  it('keeps recent projections on eviction', () => {
    const cache = createProjectionCache()
    const projection = projectSession('s1', makeEvents('s1'))
    cache.set('s1', projection)

    const nearNow = new Date('2026-01-01T00:20:00Z')
    const evicted = cache.evictStale(nearNow)
    expect(evicted).toBe(0)
    expect(cache.size()).toBe(1)
  })
})

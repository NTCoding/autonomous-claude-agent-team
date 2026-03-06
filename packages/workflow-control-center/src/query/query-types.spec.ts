import { describe, it, expect } from 'vitest'
import {
  categorizeEvent,
  extractEventDetail,
  isPermissionDenied,
  deriveSessionStatus,
} from './query-types.js'
import type { ParsedEvent } from './query-types.js'

function makeEvent(overrides: Partial<ParsedEvent> & { type: string }): ParsedEvent {
  return {
    seq: 1,
    sessionId: 'test-session',
    at: '2026-01-01T00:00:00Z',
    payload: {},
    ...overrides,
  }
}

describe('categorizeEvent', () => {
  it('categorizes transitioned as transition', () => {
    expect(categorizeEvent('transitioned')).toBe('transition')
  })

  it('categorizes session-started as session', () => {
    expect(categorizeEvent('session-started')).toBe('session')
  })

  it('categorizes journal-entry as journal', () => {
    expect(categorizeEvent('journal-entry')).toBe('journal')
  })

  it('categorizes agent events as agent', () => {
    expect(categorizeEvent('agent-registered')).toBe('agent')
    expect(categorizeEvent('agent-shut-down')).toBe('agent')
    expect(categorizeEvent('identity-verified')).toBe('agent')
    expect(categorizeEvent('context-requested')).toBe('agent')
  })

  it('categorizes permission events as permission', () => {
    expect(categorizeEvent('write-checked')).toBe('permission')
    expect(categorizeEvent('bash-checked')).toBe('permission')
    expect(categorizeEvent('plugin-read-checked')).toBe('permission')
    expect(categorizeEvent('idle-checked')).toBe('permission')
  })

  it('categorizes unknown events as domain', () => {
    expect(categorizeEvent('review-approved')).toBe('domain')
    expect(categorizeEvent('pr-created')).toBe('domain')
  })
})

describe('extractEventDetail', () => {
  it('extracts transitioned detail', () => {
    const event = makeEvent({
      type: 'transitioned',
      payload: { from: 'SPAWN', to: 'PLANNING' },
    })
    expect(extractEventDetail(event)).toBe('SPAWN -> PLANNING')
  })

  it('extracts agent-registered detail', () => {
    const event = makeEvent({
      type: 'agent-registered',
      payload: { agentType: 'developer', agentId: 'dev-1' },
    })
    expect(extractEventDetail(event)).toBe('developer: dev-1')
  })

  it('extracts agent-shut-down detail', () => {
    const event = makeEvent({
      type: 'agent-shut-down',
      payload: { agentName: 'dev-1' },
    })
    expect(extractEventDetail(event)).toBe('dev-1')
  })

  it('extracts journal-entry detail with truncation', () => {
    const longContent = 'A'.repeat(80)
    const event = makeEvent({
      type: 'journal-entry',
      payload: { agentName: 'lead', content: longContent },
    })
    const detail = extractEventDetail(event)
    expect(detail).toContain('lead: ')
    expect(detail).toContain('...')
    expect(detail.length).toBeLessThan(80)
  })

  it('extracts journal-entry short content without truncation', () => {
    const event = makeEvent({
      type: 'journal-entry',
      payload: { agentName: 'lead', content: 'short note' },
    })
    expect(extractEventDetail(event)).toBe('lead: short note')
  })

  it('extracts write-checked detail', () => {
    const event = makeEvent({
      type: 'write-checked',
      payload: { filePath: '/src/foo.ts' },
    })
    expect(extractEventDetail(event)).toBe('/src/foo.ts')
  })

  it('extracts bash-checked detail with truncation', () => {
    const longCmd = 'B'.repeat(50)
    const event = makeEvent({
      type: 'bash-checked',
      payload: { command: longCmd },
    })
    const detail = extractEventDetail(event)
    expect(detail.length).toBeLessThanOrEqual(43)
    expect(detail).toContain('...')
  })

  it('extracts plugin-read-checked detail', () => {
    const event = makeEvent({
      type: 'plugin-read-checked',
      payload: { path: '/plugin/cache/file' },
    })
    expect(extractEventDetail(event)).toBe('/plugin/cache/file')
  })

  it('extracts idle-checked detail', () => {
    const event = makeEvent({
      type: 'idle-checked',
      payload: { agentName: 'developer' },
    })
    expect(extractEventDetail(event)).toBe('developer')
  })

  it('extracts identity-verified detail', () => {
    const event = makeEvent({
      type: 'identity-verified',
      payload: { status: 'verified' },
    })
    expect(extractEventDetail(event)).toBe('verified')
  })

  it('extracts context-requested detail', () => {
    const event = makeEvent({
      type: 'context-requested',
      payload: { agentName: 'reviewer' },
    })
    expect(extractEventDetail(event)).toBe('reviewer')
  })

  it('extracts session-started detail', () => {
    const event = makeEvent({
      type: 'session-started',
      payload: { repository: 'owner/repo' },
    })
    expect(extractEventDetail(event)).toBe('owner/repo')
  })

  it('extracts domain event first string field', () => {
    const event = makeEvent({
      type: 'review-approved',
      payload: { reason: 'looks good' },
    })
    expect(extractEventDetail(event)).toBe('looks good')
  })

  it('falls back to event type for domain events with no string fields', () => {
    const event = makeEvent({
      type: 'custom-event',
      payload: { count: 42 },
    })
    expect(extractEventDetail(event)).toBe('custom-event')
  })

  it('handles missing payload fields gracefully', () => {
    const event = makeEvent({ type: 'transitioned', payload: {} })
    expect(extractEventDetail(event)).toBe('? -> ?')
  })
})

describe('isPermissionDenied', () => {
  it('returns true for denied permission events', () => {
    const event = makeEvent({
      type: 'write-checked',
      payload: { allowed: false },
    })
    expect(isPermissionDenied(event)).toBe(true)
  })

  it('returns false for allowed permission events', () => {
    const event = makeEvent({
      type: 'bash-checked',
      payload: { allowed: true },
    })
    expect(isPermissionDenied(event)).toBe(false)
  })

  it('returns undefined for non-permission events', () => {
    const event = makeEvent({ type: 'transitioned', payload: {} })
    expect(isPermissionDenied(event)).toBeUndefined()
  })
})

describe('deriveSessionStatus', () => {
  it('returns active for recent events', () => {
    const now = new Date('2026-01-01T01:00:00Z')
    expect(deriveSessionStatus('2026-01-01T00:45:00Z', now)).toBe('active')
  })

  it('returns stale for events 30min-24h old', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    expect(deriveSessionStatus('2026-01-01T10:00:00Z', now)).toBe('stale')
  })

  it('returns completed for events older than 24h', () => {
    const now = new Date('2026-01-03T00:00:00Z')
    expect(deriveSessionStatus('2026-01-01T00:00:00Z', now)).toBe('completed')
  })
})

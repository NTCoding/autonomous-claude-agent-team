import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import {
  getDistinctSessionIds,
  getSessionEvents,
  getSessionEventsPaginated,
  getMaxSeq,
  getEventsSinceSeq,
  getSessionCount,
  getTotalEventCount,
} from './session-queries.js'
import {
  createTestDb,
  createTestQueryDeps,
  seedSessionEvents,
  seedMultipleSessions,
  insertEvent,
} from './session-queries-test-fixtures.js'

describe('session-queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  describe('getDistinctSessionIds', () => {
    it('returns empty array for empty database', () => {
      expect(getDistinctSessionIds(createTestQueryDeps(db))).toEqual([])
    })

    it('returns distinct session IDs', () => {
      seedMultipleSessions(db)
      const ids = getDistinctSessionIds(createTestQueryDeps(db))
      expect(ids).toHaveLength(2)
      expect(ids).toContain('session-a')
      expect(ids).toContain('session-b')
    })
  })

  describe('getSessionEvents', () => {
    it('returns empty array for unknown session', () => {
      expect(getSessionEvents(createTestQueryDeps(db), 'nonexistent')).toEqual([])
    })

    it('returns events in order for a session', () => {
      seedSessionEvents(db, 'test-1')
      const events = getSessionEvents(createTestQueryDeps(db), 'test-1')
      expect(events.length).toBeGreaterThan(0)
      expect(events[0]?.type).toBe('session-started')
      expect(events[0]?.sessionId).toBe('test-1')
    })

    it('parses payload JSON correctly', () => {
      seedSessionEvents(db, 'test-1')
      const events = getSessionEvents(createTestQueryDeps(db), 'test-1')
      const started = events[0]
      expect(started?.payload['repository']).toBe('test/repo')
    })
  })

  describe('getSessionEventsPaginated', () => {
    it('paginates events', () => {
      seedSessionEvents(db, 'test-1')
      const deps = createTestQueryDeps(db)
      const result = getSessionEventsPaginated(deps, 'test-1', 2, 0)
      expect(result.events).toHaveLength(2)
      expect(result.total).toBe(7)
    })

    it('filters by type', () => {
      seedSessionEvents(db, 'test-1')
      const deps = createTestQueryDeps(db)
      const result = getSessionEventsPaginated(deps, 'test-1', 100, 0, {
        type: 'transitioned',
      })
      expect(result.events.every((e) => e.type === 'transitioned')).toBe(true)
      expect(result.total).toBe(3)
    })
  })

  describe('getMaxSeq', () => {
    it('returns 0 for empty database', () => {
      expect(getMaxSeq(createTestQueryDeps(db))).toBe(0)
    })

    it('returns highest sequence number', () => {
      seedSessionEvents(db, 'test-1')
      expect(getMaxSeq(createTestQueryDeps(db))).toBe(7)
    })
  })

  describe('getEventsSinceSeq', () => {
    it('returns events after given sequence', () => {
      seedSessionEvents(db, 'test-1')
      const deps = createTestQueryDeps(db)
      const events = getEventsSinceSeq(deps, 5)
      expect(events.length).toBe(2)
      expect(events[0]?.seq).toBe(6)
    })

    it('returns empty array when nothing new', () => {
      seedSessionEvents(db, 'test-1')
      const deps = createTestQueryDeps(db)
      const events = getEventsSinceSeq(deps, 7)
      expect(events).toHaveLength(0)
    })
  })

  describe('getSessionCount', () => {
    it('returns 0 for empty database', () => {
      expect(getSessionCount(createTestQueryDeps(db))).toBe(0)
    })

    it('returns count of distinct sessions', () => {
      seedMultipleSessions(db)
      expect(getSessionCount(createTestQueryDeps(db))).toBe(2)
    })
  })

  describe('getTotalEventCount', () => {
    it('returns 0 for empty database', () => {
      expect(getTotalEventCount(createTestQueryDeps(db))).toBe(0)
    })

    it('returns total event count', () => {
      seedSessionEvents(db, 'test-1')
      expect(getTotalEventCount(createTestQueryDeps(db))).toBe(7)
    })
  })
})

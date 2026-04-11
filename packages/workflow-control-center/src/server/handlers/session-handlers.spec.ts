import { describe, it, expect, beforeEach } from 'vitest'
import {
  handleListSessions,
  handleGetSession,
  handleGetSessionEvents,
  handleGetSessionJournal,
  handleGetSessionInsights,
} from './session-handlers.js'
import type { SessionHandlerDeps } from './session-handlers.js'
import {
  createTestDb,
  seedSessionEvents,
  seedMultipleSessions,
} from '../../query/session-queries-test-fixtures.js'
import type { SqliteDatabase } from '../../query/sqlite-runtime.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function mockReq(): IncomingMessage {
  return {} as IncomingMessage
}

function mockRes(): ServerResponse & { written: { statusCode: number; body: string } } {
  const written = { statusCode: 0, body: '' }
  return {
    writeHead(code: number, _headers?: Record<string, string | number>) {
      written.statusCode = code
      return this
    },
    end(body?: string) {
      written.body = body ?? ''
      return this
    },
    written,
  } as unknown as ServerResponse & { written: { statusCode: number; body: string } }
}

function makeRoute(params: Record<string, string> = {}, query: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(query)
  return { path: '/test', query: searchParams, params }
}

describe('session-handlers', () => {
  let db: SqliteDatabase
  let deps: SessionHandlerDeps

  beforeEach(() => {
    db = createTestDb()
    deps = {
      queryDeps: { db },
      now: () => new Date('2026-01-01T00:15:00Z'),
    }
  })

  describe('handleListSessions', () => {
    it('returns empty sessions for empty db', () => {
      const handler = handleListSessions(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      const body = JSON.parse(res.written.body)
      expect(body.sessions).toEqual([])
      expect(body.total).toBe(0)
    })

    it('returns sessions with projections', () => {
      seedMultipleSessions(db)
      const handler = handleListSessions(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      const body = JSON.parse(res.written.body)
      expect(body.sessions).toHaveLength(2)
      expect(body.total).toBe(2)
    })

    it('filters by status', () => {
      seedMultipleSessions(db)
      const handler = handleListSessions(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { status: 'active' }))
      const body = JSON.parse(res.written.body)
      expect(body.sessions.every((s: { status: string }) => s.status === 'active')).toBe(true)
    })

    it('paginates results', () => {
      seedMultipleSessions(db)
      const handler = handleListSessions(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { limit: '1', offset: '0' }))
      const body = JSON.parse(res.written.body)
      expect(body.sessions).toHaveLength(1)
    })
  })

  describe('handleGetSession', () => {
    it('returns 404 for unknown session', () => {
      const handler = handleGetSession(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'nonexistent' }))
      expect(res.written.statusCode).toBe(404)
    })

    it('returns session detail with insights', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSession(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.sessionId).toBe('test-1')
      expect(body.insights).toBeDefined()
      expect(body.statePeriods).toBeDefined()
    })

    it('returns 400 for missing session ID', () => {
      const handler = handleGetSession(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}))
      expect(res.written.statusCode).toBe(400)
    })

    it('includes suggestions in response', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSession(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }))
      const body = JSON.parse(res.written.body)
      expect(body.suggestions).toBeDefined()
      expect(Array.isArray(body.suggestions)).toBe(true)
    })
  })

  describe('handleGetSessionEvents', () => {
    it('returns annotated events', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.events.length).toBeGreaterThan(0)
      expect(body.events[0].category).toBeDefined()
      expect(body.events[0].detail).toBeDefined()
    })

    it('filters by category', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }, { category: 'transition' }))
      const body = JSON.parse(res.written.body)
      expect(body.events.every((e: { category: string }) => e.category === 'transition')).toBe(true)
    })

    it('filters by denied status', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }, { denied: 'true' }))
      const body = JSON.parse(res.written.body)
      expect(body.events.every((e: { denied: boolean }) => e.denied === true)).toBe(true)
    })

    it('filters denied=false', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }, { denied: 'false' }))
      const body = JSON.parse(res.written.body)
      expect(body.events.every((e: { denied: boolean | undefined }) => e.denied === false || e.denied === undefined)).toBe(true)
    })

    it('filters by type', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }, { type: 'transitioned' }))
      const body = JSON.parse(res.written.body)
      expect(body.events.every((e: { type: string }) => e.type === 'transitioned')).toBe(true)
    })

    it('returns 400 for missing session ID', () => {
      const handler = handleGetSessionEvents(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}))
      expect(res.written.statusCode).toBe(400)
    })
  })

  describe('handleGetSessionJournal', () => {
    it('returns journal entries', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionJournal(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.entries).toBeDefined()
    })

    it('returns 404 for unknown session', () => {
      const handler = handleGetSessionJournal(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'nonexistent' }))
      expect(res.written.statusCode).toBe(404)
    })

    it('returns 400 for missing session ID', () => {
      const handler = handleGetSessionJournal(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}))
      expect(res.written.statusCode).toBe(400)
    })
  })

  describe('handleGetSessionInsights', () => {
    it('returns insights for session', () => {
      seedSessionEvents(db, 'test-1')
      const handler = handleGetSessionInsights(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'test-1' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.insights).toBeDefined()
    })

    it('returns 404 for unknown session', () => {
      const handler = handleGetSessionInsights(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({ id: 'nonexistent' }))
      expect(res.written.statusCode).toBe(404)
    })

    it('returns 400 for missing session ID', () => {
      const handler = handleGetSessionInsights(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}))
      expect(res.written.statusCode).toBe(400)
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import {
  handleAnalyticsOverview,
  handleAnalyticsTrends,
  handleAnalyticsPatterns,
  handleAnalyticsCompare,
} from './analytics-handlers.js'
import type { AnalyticsHandlerDeps } from './analytics-handlers.js'
import {
  createTestDb,
  seedMultipleSessions,
  seedSessionEvents,
} from '../../query/session-queries-test-fixtures.js'
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
  return { path: '/test', query: new URLSearchParams(query), params }
}

describe('analytics-handlers', () => {
  let db: Database.Database
  let deps: AnalyticsHandlerDeps

  beforeEach(() => {
    db = createTestDb()
    deps = {
      queryDeps: { db },
      now: () => new Date('2026-01-01T00:15:00Z'),
    }
  })

  describe('handleAnalyticsOverview', () => {
    it('returns overview for empty db', () => {
      const handler = handleAnalyticsOverview(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.totalSessions).toBe(0)
    })

    it('returns overview with sessions', () => {
      seedMultipleSessions(db)
      const handler = handleAnalyticsOverview(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      const body = JSON.parse(res.written.body)
      expect(body.totalSessions).toBe(2)
      expect(body.denialHotspots).toBeDefined()
      expect(body.stateTimeDistribution).toBeDefined()
    })
  })

  describe('handleAnalyticsTrends', () => {
    it('returns trend data points', () => {
      seedMultipleSessions(db)
      const handler = handleAnalyticsTrends(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { metric: 'duration', window: '7d', bucket: 'day' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.dataPoints).toBeDefined()
    })

    it('uses defaults when params not provided', () => {
      const handler = handleAnalyticsTrends(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      expect(res.written.statusCode).toBe(200)
    })

    it('handles 7d window', () => {
      const handler = handleAnalyticsTrends(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { window: '7d' }))
      expect(res.written.statusCode).toBe(200)
    })

    it('handles 90d window', () => {
      const handler = handleAnalyticsTrends(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { window: '90d' }))
      expect(res.written.statusCode).toBe(200)
    })
  })

  describe('handleAnalyticsPatterns', () => {
    it('returns patterns', () => {
      seedMultipleSessions(db)
      const handler = handleAnalyticsPatterns(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.patterns).toBeDefined()
    })
  })

  describe('handleAnalyticsCompare', () => {
    it('returns 400 when params missing', () => {
      const handler = handleAnalyticsCompare(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute())
      expect(res.written.statusCode).toBe(400)
    })

    it('returns 404 for unknown session A', () => {
      const handler = handleAnalyticsCompare(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { a: 'nonexistent', b: 'also-nonexistent' }))
      expect(res.written.statusCode).toBe(404)
    })

    it('returns 404 for unknown session B', () => {
      seedSessionEvents(db, 'session-a')
      const handler = handleAnalyticsCompare(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { a: 'session-a', b: 'nonexistent' }))
      expect(res.written.statusCode).toBe(404)
    })

    it('returns comparison for valid sessions', () => {
      seedMultipleSessions(db)
      const handler = handleAnalyticsCompare(deps)
      const res = mockRes()
      handler(mockReq(), res, makeRoute({}, { a: 'session-a', b: 'session-b' }))
      expect(res.written.statusCode).toBe(200)
      const body = JSON.parse(res.written.body)
      expect(body.sessionA).toBeDefined()
      expect(body.sessionB).toBeDefined()
      expect(body.deltas).toBeDefined()
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHttpServer } from './http-server.js'
import type { HttpServerInstance } from './http-server.js'
import {
  createTestDb,
  seedSessionEvents,
  seedMultipleSessions,
} from '../query/session-queries-test-fixtures.js'
import type { SqliteDatabase } from '../query/sqlite-runtime.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import http from 'node:http'

function httpGet(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

describe('createHttpServer', () => {
  let db: SqliteDatabase
  let server: HttpServerInstance
  let distDir: string
  const port = 0

  beforeEach(async () => {
    db = createTestDb()
    distDir = join(tmpdir(), 'wcc-test-' + Date.now())
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, 'index.html'), '<html>test</html>')

    server = createHttpServer({
      queryDeps: { db },
      distDir,
      now: () => new Date('2026-01-01T00:15:00Z'),
    })
  })

  afterEach(async () => {
    await server.stop()
    rmSync(distDir, { recursive: true, force: true })
  })

  function getPort(): number {
    const addr = server.server.address()
    if (typeof addr === 'object' && addr !== null) return addr.port
    throw new Error('Server not started')
  }

  it('serves API sessions endpoint', async () => {
    seedMultipleSessions(db)
    await server.start(0)
    const { statusCode, body } = await httpGet(getPort(), '/api/sessions')
    expect(statusCode).toBe(200)
    const parsed = JSON.parse(body)
    expect(parsed.sessions).toHaveLength(2)
  })

  it('serves session detail endpoint', async () => {
    seedSessionEvents(db, 'test-1')
    await server.start(0)
    const { statusCode, body } = await httpGet(getPort(), '/api/sessions/test-1')
    expect(statusCode).toBe(200)
    const parsed = JSON.parse(body)
    expect(parsed.sessionId).toBe('test-1')
  })

  it('serves static files', async () => {
    await server.start(0)
    const { statusCode, body } = await httpGet(getPort(), '/')
    expect(statusCode).toBe(200)
    expect(body).toContain('<html>')
  })

  it('returns 404 for unknown paths', async () => {
    await server.start(0)
    const { statusCode } = await httpGet(getPort(), '/nonexistent/path')
    expect(statusCode).toBe(404)
  })

  it('serves analytics overview', async () => {
    seedMultipleSessions(db)
    await server.start(0)
    const { statusCode, body } = await httpGet(getPort(), '/api/analytics/overview')
    expect(statusCode).toBe(200)
    const parsed = JSON.parse(body)
    expect(parsed.totalSessions).toBe(2)
  })

  it('returns 500 for server errors', async () => {
    const brokenDb = createTestDb()
    brokenDb.close()
    const brokenServer = createHttpServer({
      queryDeps: { db: brokenDb },
      distDir,
      now: () => new Date('2026-01-01T00:15:00Z'),
    })
    await brokenServer.start(0)
    const addr = brokenServer.server.address()
    const brokenPort = typeof addr === 'object' && addr !== null ? addr.port : 0
    const { statusCode } = await httpGet(brokenPort, '/api/sessions')
    expect(statusCode).toBe(500)
    await brokenServer.stop()
  })

  it('handles requests with query strings in static paths', async () => {
    await server.start(0)
    const { statusCode } = await httpGet(getPort(), '/?foo=bar')
    expect(statusCode).toBe(200)
  })

  it('serves SSE endpoint', async () => {
    await server.start(0)
    const actualPort = getPort()

    const connected = new Promise<string>((resolve) => {
      http.get(`http://localhost:${actualPort}/events`, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
          if (data.includes('connected')) {
            res.destroy()
            resolve(data)
          }
        })
      })
    })

    const sseData = await connected
    expect(sseData).toContain('event: connected')
  })
})

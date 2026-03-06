import { describe, it, expect, vi } from 'vitest'
import { createRouter, sendJson, sendError } from './router.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function mockReq(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage
}

function mockRes(): ServerResponse & { written: { statusCode: number; headers: Record<string, string>; body: string } } {
  const written = { statusCode: 0, headers: {} as Record<string, string>, body: '' }
  return {
    writeHead(code: number, headers?: Record<string, string>) {
      written.statusCode = code
      Object.assign(written.headers, headers ?? {})
      return this
    },
    end(body?: string) {
      written.body = body ?? ''
      return this
    },
    written,
  } as unknown as ServerResponse & { written: { statusCode: number; headers: Record<string, string>; body: string } }
}

describe('createRouter', () => {
  it('routes exact paths', async () => {
    const router = createRouter()
    const handler = vi.fn()
    router.get('/api/test', handler)

    const handled = await router.handle(mockReq('GET', '/api/test'), mockRes())
    expect(handled).toBe(true)
    expect(handler).toHaveBeenCalled()
  })

  it('extracts route params', async () => {
    const router = createRouter()
    const handler = vi.fn()
    router.get('/api/sessions/:id', handler)

    const res = mockRes()
    await router.handle(mockReq('GET', '/api/sessions/abc-123'), res)
    expect(handler).toHaveBeenCalled()

    const routeParams = handler.mock.calls[0]?.[2]
    expect(routeParams?.params['id']).toBe('abc-123')
  })

  it('parses query parameters', async () => {
    const router = createRouter()
    const handler = vi.fn()
    router.get('/api/sessions', handler)

    await router.handle(mockReq('GET', '/api/sessions?status=active&limit=10'), mockRes())
    const routeParams = handler.mock.calls[0]?.[2]
    expect(routeParams?.query.get('status')).toBe('active')
    expect(routeParams?.query.get('limit')).toBe('10')
  })

  it('returns false for no matching route', async () => {
    const router = createRouter()
    const handled = await router.handle(mockReq('GET', '/nonexistent'), mockRes())
    expect(handled).toBe(false)
  })

  it('handles missing method and url', async () => {
    const router = createRouter()
    router.get('/', vi.fn())
    const req = {} as IncomingMessage
    const handled = await router.handle(req, mockRes())
    expect(handled).toBe(true)
  })

  it('does not match wrong method', async () => {
    const router = createRouter()
    router.get('/api/test', vi.fn())

    const handled = await router.handle(mockReq('POST', '/api/test'), mockRes())
    expect(handled).toBe(false)
  })
})

describe('sendJson', () => {
  it('sends JSON with correct headers', () => {
    const res = mockRes()
    sendJson(res, 200, { key: 'value' })
    expect(res.written.statusCode).toBe(200)
    expect(res.written.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(res.written.body)).toEqual({ key: 'value' })
  })
})

describe('sendError', () => {
  it('sends error as JSON', () => {
    const res = mockRes()
    sendError(res, 404, 'Not found')
    expect(res.written.statusCode).toBe(404)
    expect(JSON.parse(res.written.body)).toEqual({ error: 'Not found' })
  })
})

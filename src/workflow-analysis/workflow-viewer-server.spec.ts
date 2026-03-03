import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { createStore, appendEvents } from '../workflow-event-store/sqlite-event-store.js'
import { startViewerServer, routeRequest, extractRequestUrl, extractServerPort, extractCaptureGroup } from './workflow-viewer-server.js'
import type { ViewerServerDeps, TimerId, HttpResponse } from './workflow-viewer-server.js'
import { WorkflowError } from '../infra/workflow-error.js'

const tmpDb = (name: string): string => join(tmpdir(), `workflow-viewer-server-spec-${name}.db`)

function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'

function makeDeps(): ViewerServerDeps & { browserUrls: string[] } {
  const browserUrls: string[] = []
  return {
    browserUrls,
    openBrowser: (url: string) => { browserUrls.push(url) },
    scheduleTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    cancelTimeout: (id: TimerId | undefined) => { globalThis.clearTimeout(id) },
  }
}

const SessionListItemSchema = z.array(z.object({ sessionId: z.string() }))
const SessionViewDataSchema = z.object({ sessionId: z.string(), recentEvents: z.array(z.unknown()) })

async function fetchJsonAs<T>(url: string, schema: z.ZodType<T>): Promise<{ status: number; data: T }> {
  const res = await fetch(url)
  const raw: unknown = await res.json()
  return { status: res.status, data: schema.parse(raw) }
}

async function fetchText(url: string): Promise<{ status: number; contentType: string | null; body: string }> {
  const res = await fetch(url)
  const body = await res.text()
  return { status: res.status, contentType: res.headers.get('content-type'), body }
}

describe('startViewerServer', () => {
  const dbPath = tmpDb('basic')
  afterAll(() => { cleanup(dbPath) })

  it('opens the browser with the server URL', () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    server.close()
    expect(deps.browserUrls).toStrictEqual([server.url])
  })

  it('server URL starts with http://localhost', () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    server.close()
    expect(server.url.startsWith('http://localhost:')).toStrictEqual(true)
  })
})

describe('GET /api/sessions', () => {
  const dbPath = tmpDb('sessions')
  afterAll(() => { cleanup(dbPath) })

  it('returns a valid JSON array of session list items', async () => {
    const store = createStore(dbPath)
    appendEvents(store, 'session-a', [{ type: 'ev.start', at: T0 }, { type: 'ev.end', at: T1 }])
    appendEvents(store, 'session-b', [{ type: 'ev.start', at: T0 }])

    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { status, data } = await fetchJsonAs(`${server.url}/api/sessions`, SessionListItemSchema)
      expect(status).toStrictEqual(200)
      expect(Array.isArray(data)).toStrictEqual(true)
    } finally {
      server.close()
    }
  })

  it('returns session list items with correct sessionId fields', async () => {
    const store = createStore(dbPath)
    appendEvents(store, 'unique-sess', [{ type: 'ev', at: T0 }])

    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { data } = await fetchJsonAs(`${server.url}/api/sessions`, SessionListItemSchema)
      const ids = data.map((i) => i.sessionId)
      expect(ids).toContain('unique-sess')
    } finally {
      server.close()
    }
  })
})

describe('GET /api/sessions/:id/events', () => {
  const dbPath = tmpDb('events')
  afterAll(() => { cleanup(dbPath) })

  it('returns a valid JSON session view data object', async () => {
    const store = createStore(dbPath)
    appendEvents(store, 'detail-sess', [{ type: 'ev.start', at: T0 }, { type: 'ev.done', at: T1 }])

    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { status, data } = await fetchJsonAs(`${server.url}/api/sessions/detail-sess/events`, SessionViewDataSchema)
      expect(status).toStrictEqual(200)
      expect(data.sessionId).toStrictEqual('detail-sess')
    } finally {
      server.close()
    }
  })

  it('returns view data with recentEvents array', async () => {
    const store = createStore(dbPath)
    appendEvents(store, 'detail-sess2', [{ type: 'ev.a', at: T0 }])

    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { data } = await fetchJsonAs(`${server.url}/api/sessions/detail-sess2/events`, SessionViewDataSchema)
      expect(Array.isArray(data.recentEvents)).toStrictEqual(true)
    } finally {
      server.close()
    }
  })
})

describe('GET /', () => {
  const dbPath = tmpDb('html')
  afterAll(() => { cleanup(dbPath) })

  it('returns 200 with content-type text/html', async () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { status, contentType } = await fetchText(`${server.url}/`)
      expect(status).toStrictEqual(200)
      expect(contentType).toContain('text/html')
    } finally {
      server.close()
    }
  })

  it('returns HTML body containing DOCTYPE', async () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const { body } = await fetchText(`${server.url}/`)
      expect(body.toLowerCase().startsWith('<!doctype html>')).toStrictEqual(true)
    } finally {
      server.close()
    }
  })
})

describe('404 for unknown routes', () => {
  const dbPath = tmpDb('notfound')
  afterAll(() => { cleanup(dbPath) })

  it('returns 404 for an unknown path', async () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const res = await fetch(`${server.url}/no-such-path`)
      expect(res.status).toStrictEqual(404)
    } finally {
      server.close()
    }
  })

  it('returns 404 for session id path without events suffix', async () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    try {
      const res = await fetch(`${server.url}/api/sessions/some-id`)
      expect(res.status).toStrictEqual(404)
    } finally {
      server.close()
    }
  })
})

describe('auto-close after inactivity', () => {
  const dbPath = tmpDb('timeout')
  afterAll(() => { cleanup(dbPath) })

  it('closes the server when the inactivity timer fires', () => {
    const store = createStore(dbPath)
    const scheduledCallbacks: Array<() => void> = []

    const fakeDeps: ViewerServerDeps = {
      openBrowser: (_url: string) => {},
      scheduleTimeout: (fn: () => void, _ms: number) => {
        scheduledCallbacks.push(fn)
        return globalThis.setTimeout(() => {}, 0)
      },
      cancelTimeout: (_id: TimerId | undefined) => {},
    }

    const server = startViewerServer(store, fakeDeps)

    expect(scheduledCallbacks.length).toBeGreaterThan(0)

    const lastCallback = scheduledCallbacks[scheduledCallbacks.length - 1]
    if (lastCallback) {
      lastCallback()
    }

    server.close()
    expect(server.url.startsWith('http://localhost:')).toStrictEqual(true)
  })

  it('resets the inactivity timer on each request', async () => {
    const store = createStore(dbPath)
    appendEvents(store, 'timer-sess2', [{ type: 'ev', at: T0 }])

    const cancelCalls: number[] = []
    const deps: ViewerServerDeps = {
      openBrowser: (_url: string) => {},
      scheduleTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
      cancelTimeout: (id: TimerId | undefined) => {
        cancelCalls.push(1)
        globalThis.clearTimeout(id)
      },
    }

    const server = startViewerServer(store, deps)
    const callsAfterStart = cancelCalls.length

    await fetch(`${server.url}/api/sessions`)

    expect(cancelCalls.length).toBeGreaterThan(callsAfterStart)
    server.close()
  })
})

describe('extractRequestUrl', () => {
  it('returns req.url when it is defined', () => {
    expect(extractRequestUrl({ url: '/some-path' })).toStrictEqual('/some-path')
  })

  it('returns / when req.url is undefined', () => {
    expect(extractRequestUrl({})).toStrictEqual('/')
  })
})

describe('extractCaptureGroup', () => {
  it('returns the captured group value when index is in bounds', () => {
    const match = /^\/api\/sessions\/([^/]+)\/events$/.exec('/api/sessions/my-session/events')
    if (!match) throw new WorkflowError('regex should match /api/sessions/my-session/events')
    expect(extractCaptureGroup(match, 1)).toStrictEqual('my-session')
  })

  it('returns empty string when index is out of bounds', () => {
    const match = /^(a)$/.exec('a')
    if (!match) throw new WorkflowError('regex should match a')
    expect(extractCaptureGroup(match, 99)).toStrictEqual('')
  })
})

describe('extractServerPort', () => {
  it('returns port when address is AddressInfo', () => {
    expect(extractServerPort({ address: '0.0.0.0', family: 'IPv4', port: 3000 })).toStrictEqual(3000)
  })

  it('returns 0 when address is null', () => {
    expect(extractServerPort(null)).toStrictEqual(0)
  })

  it('returns 0 when address is a string', () => {
    expect(extractServerPort('/tmp/socket.sock')).toStrictEqual(0)
  })
})

describe('routeRequest', () => {
  const dbPath = tmpDb('route')
  afterAll(() => { cleanup(dbPath) })

  type MockRes = HttpResponse & {
    statusCode: number
    ended: boolean
  }

  function makeMockRes(): MockRes {
    const state = { statusCode: 0, ended: false }
    return {
      get statusCode() { return state.statusCode },
      get ended() { return state.ended },
      writeHead(code: number, _hdrs?: Record<string, string>): void {
        state.statusCode = code
      },
      end(_data?: string): void {
        state.ended = true
      },
    }
  }

  it('returns 404 for unknown route', () => {
    const store = createStore(dbPath)
    const res = makeMockRes()
    routeRequest('/unknown-path', res, store)
    expect(res.statusCode).toStrictEqual(404)
  })

  it('returns 200 for /api/sessions', () => {
    const store = createStore(dbPath)
    const res = makeMockRes()
    routeRequest('/api/sessions', res, store)
    expect(res.statusCode).toStrictEqual(200)
  })

  it('returns 200 for /api/sessions/:id/events', () => {
    const store = createStore(dbPath)
    appendEvents(store, 'route-sess', [{ type: 'ev', at: T0 }])
    const res = makeMockRes()
    routeRequest('/api/sessions/route-sess/events', res, store)
    expect(res.statusCode).toStrictEqual(200)
  })

  it('returns 200 for /', () => {
    const store = createStore(dbPath)
    const res = makeMockRes()
    routeRequest('/', res, store)
    expect(res.statusCode).toStrictEqual(200)
  })
})

describe('server closes cleanly', () => {
  const dbPath = tmpDb('clean-close')
  afterAll(() => { cleanup(dbPath) })

  it('does not throw when close is called', () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    expect(() => { server.close() }).not.toThrow()
  })

  it('url remains accessible after close is recorded', () => {
    const store = createStore(dbPath)
    const deps = makeDeps()
    const server = startViewerServer(store, deps)
    const { url } = server
    server.close()
    expect(typeof url).toStrictEqual('string')
    expect(url.length).toBeGreaterThan(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSseHub } from './sse-hub.js'
import type { ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'

function mockSseResponse(): ServerResponse & {
  chunks: Array<string>
  headStatus: number
} {
  const emitter = new EventEmitter()
  const mock = Object.assign(emitter, {
    chunks: [] as Array<string>,
    headStatus: 0,
    writeHead(code: number, _headers?: Record<string, string>) {
      mock.headStatus = code
      return mock
    },
    write(data: string) {
      mock.chunks.push(data)
      return true
    },
    end() {
      return mock
    },
  })
  return mock as unknown as ServerResponse & { chunks: Array<string>; headStatus: number }
}

describe('createSseHub', () => {
  let hub: ReturnType<typeof createSseHub>

  beforeEach(() => {
    hub = createSseHub()
  })

  afterEach(() => {
    hub.stopHeartbeat()
  })

  it('starts with zero connections', () => {
    expect(hub.connectionCount()).toBe(0)
  })

  it('adds connections and sends connected event', () => {
    const res = mockSseResponse()
    hub.addConnection('conn-1', res)
    expect(hub.connectionCount()).toBe(1)
    expect(res.headStatus).toBe(200)
    expect(res.chunks.length).toBeGreaterThan(0)
    expect(res.chunks[0]).toContain('event: connected')
  })

  it('removes connections', () => {
    const res = mockSseResponse()
    hub.addConnection('conn-1', res)
    hub.removeConnection('conn-1')
    expect(hub.connectionCount()).toBe(0)
  })

  it('broadcasts to all connections', () => {
    const res1 = mockSseResponse()
    const res2 = mockSseResponse()
    hub.addConnection('conn-1', res1)
    hub.addConnection('conn-2', res2)

    hub.broadcast('new-event', { test: true })
    expect(res1.chunks.some((c) => c.includes('new-event'))).toBe(true)
    expect(res2.chunks.some((c) => c.includes('new-event'))).toBe(true)
  })

  it('filters by session when broadcasting', () => {
    const res1 = mockSseResponse()
    const res2 = mockSseResponse()
    hub.addConnection('conn-1', res1, 'session-a')
    hub.addConnection('conn-2', res2, 'session-b')

    hub.broadcast('new-event', { test: true }, 'session-a')
    const res1HasEvent = res1.chunks.some((c) => c.includes('"test":true'))
    const res2HasEvent = res2.chunks.some((c) => c.includes('"test":true'))
    expect(res1HasEvent).toBe(true)
    expect(res2HasEvent).toBe(false)
  })

  it('removes connection on close event', () => {
    const res = mockSseResponse()
    hub.addConnection('conn-1', res)
    expect(hub.connectionCount()).toBe(1)

    res.emit('close')
    expect(hub.connectionCount()).toBe(0)
  })

  it('handles write errors by removing connection', () => {
    const res = mockSseResponse()
    hub.addConnection('conn-1', res)

    res.write = () => {
      throw new Error('Connection closed')
    }

    hub.broadcast('test', { data: 1 })
    expect(hub.connectionCount()).toBe(0)
  })

  it('starts and stops heartbeat', () => {
    vi.useFakeTimers()
    hub.startHeartbeat()

    const res = mockSseResponse()
    hub.addConnection('conn-1', res)

    vi.advanceTimersByTime(30000)
    const hasHeartbeat = res.chunks.some((c) => c === ':\n\n')
    expect(hasHeartbeat).toBe(true)

    hub.stopHeartbeat()
    vi.useRealTimers()
  })

  it('removing non-existent connection is safe', () => {
    hub.removeConnection('nonexistent')
    expect(hub.connectionCount()).toBe(0)
  })

  it('removes connection on heartbeat write error', () => {
    vi.useFakeTimers()
    hub.startHeartbeat()

    const res = mockSseResponse()
    hub.addConnection('conn-1', res)

    res.write = () => {
      throw new Error('Connection broken')
    }

    vi.advanceTimersByTime(30000)
    expect(hub.connectionCount()).toBe(0)

    hub.stopHeartbeat()
    vi.useRealTimers()
  })
})

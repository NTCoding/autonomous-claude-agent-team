import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createStaticFileServer } from './static-assets.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ServerResponse } from 'node:http'

function mockRes(): ServerResponse & { written: { statusCode: number; body: Buffer | string; headers: Record<string, string | number> } } {
  const written = { statusCode: 0, body: '' as Buffer | string, headers: {} as Record<string, string | number> }
  return {
    writeHead(code: number, headers?: Record<string, string | number>) {
      written.statusCode = code
      Object.assign(written.headers, headers ?? {})
      return this
    },
    end(body?: Buffer | string) {
      written.body = body ?? ''
      return this
    },
    written,
  } as unknown as ServerResponse & { written: { statusCode: number; body: Buffer | string; headers: Record<string, string | number> } }
}

describe('createStaticFileServer', () => {
  const testDir = join(tmpdir(), 'wcc-test-static-' + Date.now())

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'index.html'), '<html>test</html>')
    writeFileSync(join(testDir, 'styles.css'), 'body {}')
    writeFileSync(join(testDir, 'app.js'), 'console.log("hi")')
    writeFileSync(join(testDir, 'data.bin'), Buffer.from([0x00, 0x01]))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('serves index.html for root path', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    const served = server.serve('/', res)
    expect(served).toBe(true)
    expect(res.written.statusCode).toBe(200)
    expect(res.written.headers['Content-Type']).toBe('text/html')
  })

  it('serves CSS files', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    server.serve('/styles.css', res)
    expect(res.written.headers['Content-Type']).toBe('text/css')
  })

  it('serves JS files', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    server.serve('/app.js', res)
    expect(res.written.headers['Content-Type']).toBe('application/javascript')
  })

  it('returns false for non-existent files', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    expect(server.serve('/nonexistent.txt', res)).toBe(false)
  })

  it('strips path traversal attempts', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    expect(server.serve('/../../../etc/passwd', res)).toBe(false)
  })

  it('serves index.html for empty path', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    const served = server.serve('', res)
    expect(served).toBe(true)
  })

  it('uses application/octet-stream for unknown extensions', () => {
    const server = createStaticFileServer(testDir)
    const res = mockRes()
    server.serve('/data.bin', res)
    expect(res.written.headers['Content-Type']).toBe('application/octet-stream')
  })
})

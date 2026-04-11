import { describe, it, expect } from 'vitest'
import { parseArgs } from './main.js'

describe('parseArgs', () => {
  it('returns defaults when no args provided', () => {
    const args = parseArgs([])
    expect(args.port).toBe(3120)
    expect(args.open).toBe(false)
    expect(args.dbPath).toContain('.workflow-events.db')
  })

  it('parses --db flag', () => {
    const args = parseArgs(['--db', '/custom/path.db'])
    expect(args.dbPath).toBe('/custom/path.db')
  })

  it('parses --port flag', () => {
    const args = parseArgs(['--port', '8080'])
    expect(args.port).toBe(8080)
  })

  it('parses --open flag', () => {
    const args = parseArgs(['--open'])
    expect(args.open).toBe(true)
  })

  it('parses multiple flags together', () => {
    const args = parseArgs(['--db', '/test.db', '--port', '9090', '--open'])
    expect(args.dbPath).toBe('/test.db')
    expect(args.port).toBe(9090)
    expect(args.open).toBe(true)
  })
})

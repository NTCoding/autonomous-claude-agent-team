import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createStore,
  appendEvents,
  readEvents,
  hasSession,
  listSessions,
} from './sqlite-event-store.js'

const tmpDb = (name: string): string => join(tmpdir(), `sqlite-event-store-spec-${name}.db`)

function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}

describe('createStore', () => {
  const dbPath = tmpDb('createStore')
  afterAll(() => { cleanup(dbPath) })

  it('creates the DB file on first call', () => {
    createStore(dbPath)
    expect(existsSync(dbPath)).toStrictEqual(true)
  })
})

describe('appendEvents + readEvents', () => {
  const dbPath = tmpDb('roundtrip')
  afterAll(() => { cleanup(dbPath) })

  it('round-trip returns same events', () => {
    const store = createStore(dbPath)
    const events = [
      { type: 'test.started', at: '2026-01-01T00:00:00.000Z' },
      { type: 'test.finished', at: '2026-01-01T00:01:00.000Z' },
    ] as const
    appendEvents(store, 'session-1', events)
    expect(readEvents(store, 'session-1')).toStrictEqual(events)
  })

  it('returns events in append order', () => {
    const store = createStore(dbPath)
    const events = [
      { type: 'a', at: '2026-01-01T00:00:00.000Z' },
      { type: 'b', at: '2026-01-01T00:01:00.000Z' },
      { type: 'c', at: '2026-01-01T00:02:00.000Z' },
    ] as const
    appendEvents(store, 'session-order', events)
    const result = readEvents(store, 'session-order')
    expect(result.map((e) => e.type)).toStrictEqual(['a', 'b', 'c'])
  })

  it('empty events array is a no-op', () => {
    const store = createStore(dbPath)
    appendEvents(store, 'session-empty', [])
    expect(readEvents(store, 'session-empty')).toStrictEqual([])
  })
})

describe('multi-session isolation', () => {
  const dbPath = tmpDb('isolation')
  afterAll(() => { cleanup(dbPath) })

  it('session A events do not appear in session B reads', () => {
    const store = createStore(dbPath)
    appendEvents(store, 'session-A', [{ type: 'ev.a', at: '2026-01-01T00:00:00.000Z' }])
    appendEvents(store, 'session-B', [{ type: 'ev.b', at: '2026-01-01T00:01:00.000Z' }])
    const resultA = readEvents(store, 'session-A')
    const resultB = readEvents(store, 'session-B')
    expect(resultA).toStrictEqual([{ type: 'ev.a', at: '2026-01-01T00:00:00.000Z' }])
    expect(resultB).toStrictEqual([{ type: 'ev.b', at: '2026-01-01T00:01:00.000Z' }])
  })
})

describe('hasSession', () => {
  const dbPath = tmpDb('hasSession')
  afterAll(() => { cleanup(dbPath) })

  it('returns false for unknown session ID', () => {
    const store = createStore(dbPath)
    expect(hasSession(store, 'nonexistent-session')).toStrictEqual(false)
  })

  it('returns true after appending events', () => {
    const store = createStore(dbPath)
    appendEvents(store, 'session-known', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    expect(hasSession(store, 'session-known')).toStrictEqual(true)
  })
})

describe('listSessions', () => {
  const dbPath = tmpDb('listSessions')
  afterAll(() => { cleanup(dbPath) })

  it('returns all distinct sessions', () => {
    const store = createStore(dbPath)
    appendEvents(store, 'alpha', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    appendEvents(store, 'beta', [{ type: 'ev', at: '2026-01-01T00:01:00.000Z' }])
    appendEvents(store, 'gamma', [{ type: 'ev', at: '2026-01-01T00:02:00.000Z' }])
    expect(listSessions(store)).toStrictEqual(['alpha', 'beta', 'gamma'])
  })
})

describe('readEvents error handling', () => {
  const dbPath = tmpDb('errors')
  afterAll(() => { cleanup(dbPath) })

  it('throws WorkflowError on corrupt JSON payload', () => {
    const store = createStore(dbPath)
    store.db.prepare(
      "INSERT INTO events (session_id, type, at, payload) VALUES ('corrupt-session', 'ev', '2026-01-01T00:00:00.000Z', 'not-json')"
    ).run()
    expect(() => readEvents(store, 'corrupt-session')).toThrow('Cannot parse event payload')
  })

  it('throws WorkflowError when payload does not match schema', () => {
    const store = createStore(dbPath)
    store.db.prepare(
      "INSERT INTO events (session_id, type, at, payload) VALUES ('invalid-schema-session', 'ev', '2026-01-01T00:00:00.000Z', '{\"no_type\":true}')"
    ).run()
    expect(() => readEvents(store, 'invalid-schema-session')).toThrow('Invalid event at index')
  })
})

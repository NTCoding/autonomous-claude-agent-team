import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore, resolveSessionId } from './sqlite-event-store.js'

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
    store.appendEvents('session-1', events)
    expect(store.readEvents('session-1')).toStrictEqual(events)
  })

  it('returns events in append order', () => {
    const store = createStore(dbPath)
    const events = [
      { type: 'a', at: '2026-01-01T00:00:00.000Z' },
      { type: 'b', at: '2026-01-01T00:01:00.000Z' },
      { type: 'c', at: '2026-01-01T00:02:00.000Z' },
    ] as const
    store.appendEvents('session-order', events)
    const result = store.readEvents('session-order')
    expect(result.map((e) => e.type)).toStrictEqual(['a', 'b', 'c'])
  })

  it('empty events array is a no-op', () => {
    const store = createStore(dbPath)
    store.appendEvents('session-empty', [])
    expect(store.readEvents('session-empty')).toStrictEqual([])
  })
})

describe('multi-session isolation', () => {
  const dbPath = tmpDb('isolation')
  afterAll(() => { cleanup(dbPath) })

  it('session A events do not appear in session B reads', () => {
    const store = createStore(dbPath)
    store.appendEvents('session-A', [{ type: 'ev.a', at: '2026-01-01T00:00:00.000Z' }])
    store.appendEvents('session-B', [{ type: 'ev.b', at: '2026-01-01T00:01:00.000Z' }])
    const resultA = store.readEvents('session-A')
    const resultB = store.readEvents('session-B')
    expect(resultA).toStrictEqual([{ type: 'ev.a', at: '2026-01-01T00:00:00.000Z' }])
    expect(resultB).toStrictEqual([{ type: 'ev.b', at: '2026-01-01T00:01:00.000Z' }])
  })
})

describe('sessionExists', () => {
  const dbPath = tmpDb('sessionExists')
  afterAll(() => { cleanup(dbPath) })

  it('returns false for unknown session ID', () => {
    const store = createStore(dbPath)
    expect(store.sessionExists('nonexistent-session')).toStrictEqual(false)
  })

  it('returns true after appending events', () => {
    const store = createStore(dbPath)
    store.appendEvents('session-known', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    expect(store.sessionExists('session-known')).toStrictEqual(true)
  })
})

describe('listSessions', () => {
  const dbPath = tmpDb('listSessions')
  afterAll(() => { cleanup(dbPath) })

  it('returns all distinct sessions', () => {
    const store = createStore(dbPath)
    store.appendEvents('alpha', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    store.appendEvents('beta', [{ type: 'ev', at: '2026-01-01T00:01:00.000Z' }])
    store.appendEvents('gamma', [{ type: 'ev', at: '2026-01-01T00:02:00.000Z' }])
    expect(store.listSessions()).toStrictEqual(['alpha', 'beta', 'gamma'])
  })
})

describe('resolveSessionId', () => {
  const dbPath = tmpDb('resolveSessionId')
  afterAll(() => { cleanup(dbPath) })

  it('returns input when exact match exists', () => {
    const store = createStore(dbPath)
    store.appendEvents('abc-123-full', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    expect(resolveSessionId(store, 'abc-123-full')).toStrictEqual('abc-123-full')
  })

  it('resolves unique prefix to full session ID', () => {
    const store = createStore(dbPath)
    store.appendEvents('unique-prefix-xyz789', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    expect(resolveSessionId(store, 'unique-prefix')).toStrictEqual('unique-prefix-xyz789')
  })

  it('throws with candidates when prefix is ambiguous', () => {
    const store = createStore(dbPath)
    store.appendEvents('ambig-aaa', [{ type: 'ev', at: '2026-01-01T00:00:00.000Z' }])
    store.appendEvents('ambig-bbb', [{ type: 'ev', at: '2026-01-01T00:01:00.000Z' }])
    expect(() => resolveSessionId(store, 'ambig')).toThrow('Ambiguous session prefix "ambig"')
    expect(() => resolveSessionId(store, 'ambig')).toThrow('ambig-aaa')
    expect(() => resolveSessionId(store, 'ambig')).toThrow('ambig-bbb')
  })

  it('throws with guidance when no match at all', () => {
    const store = createStore(dbPath)
    expect(() => resolveSessionId(store, 'nonexistent-zzz')).toThrow('No events found for session "nonexistent-zzz"')
    expect(() => resolveSessionId(store, 'nonexistent-zzz')).toThrow('analyze --all')
  })
})

describe('readEvents error handling', () => {
  const dbPath = tmpDb('errors')
  afterAll(() => { cleanup(dbPath) })

  it('throws WorkflowStateError on corrupt JSON payload', () => {
    const store = createStore(dbPath)
    store.db.prepare(
      "INSERT INTO events (session_id, type, at, payload) VALUES ('corrupt-session', 'ev', '2026-01-01T00:00:00.000Z', 'not-json')"
    ).run()
    expect(() => store.readEvents('corrupt-session')).toThrow('Cannot parse event payload')
  })

  it('throws WorkflowStateError when payload does not match schema', () => {
    const store = createStore(dbPath)
    store.db.prepare(
      "INSERT INTO events (session_id, type, at, payload) VALUES ('invalid-schema-session', 'ev', '2026-01-01T00:00:00.000Z', '{\"no_type\":true}')"
    ).run()
    expect(() => store.readEvents('invalid-schema-session')).toThrow('Invalid event at index')
  })
})

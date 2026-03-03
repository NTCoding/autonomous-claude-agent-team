import Database from 'better-sqlite3'
import { z } from 'zod'
import { WorkflowError } from './workflow-error.js'

const BaseEventSchema = z.object({ type: z.string(), at: z.string() }).passthrough()
type BaseEvent = z.infer<typeof BaseEventSchema>

export type EventStore = { db: Database.Database }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    at TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`

export function createStore(dbPath: string): EventStore {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(CREATE_TABLE_SQL)
  return { db }
}

export function appendEvents(store: EventStore, sessionId: string, events: readonly BaseEvent[]): void {
  if (events.length === 0) return
  const insert = store.db.prepare(
    'INSERT INTO events (session_id, type, at, payload) VALUES (?, ?, ?, ?)'
  )
  const transaction = store.db.transaction((evts: readonly BaseEvent[]) => {
    for (const event of evts) {
      insert.run(sessionId, event.type, event.at, JSON.stringify(event))
    }
  })
  transaction(events)
}

const RowWithPayloadSchema = z.array(z.object({ payload: z.string() }))
const RowWithSessionIdSchema = z.array(z.object({ session_id: z.string() }))

export function readEvents(store: EventStore, sessionId: string): readonly BaseEvent[] {
  const rawRows = store.db
    .prepare('SELECT payload FROM events WHERE session_id = ? ORDER BY seq')
    .all(sessionId)
  const rows = RowWithPayloadSchema.parse(rawRows)
  return rows.map((row, index) => {
    const parsed: unknown = tryParsePayload(row.payload, index)
    const result = BaseEventSchema.safeParse(parsed)
    if (!result.success) {
      throw new WorkflowError(
        `Invalid event at index ${index} for session ${sessionId}: ${result.error.message}`
      )
    }
    return result.data
  })
}

export function hasSession(store: EventStore, sessionId: string): boolean {
  const row = store.db
    .prepare('SELECT 1 FROM events WHERE session_id = ? LIMIT 1')
    .get(sessionId)
  return row !== undefined
}

export function listSessions(store: EventStore): readonly string[] {
  const rawRows = store.db
    .prepare('SELECT session_id FROM events GROUP BY session_id ORDER BY MIN(seq)')
    .all()
  const rows = RowWithSessionIdSchema.parse(rawRows)
  return rows.map((r) => r.session_id)
}

function tryParsePayload(payload: string, index: number): unknown {
  try {
    return JSON.parse(payload)
  } catch (cause) {
    throw new WorkflowError(`Cannot parse event payload at index ${index}: ${String(cause)}`)
  }
}

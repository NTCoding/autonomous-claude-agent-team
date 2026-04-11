import { z } from 'zod'
import { WorkflowStateError } from '../engine/domain/workflow-state'
import {
  enableWalMode,
  openSqliteDatabase,
  type SqliteDatabase,
} from './sqlite-runtime'

const PassthroughEventSchema = z.object({ type: z.string(), at: z.string() }).passthrough()
type BaseEvent = z.infer<typeof PassthroughEventSchema>

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    at TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`

export type SqliteEventStore = {
  readonly readEvents: (sessionId: string) => readonly BaseEvent[]
  readonly appendEvents: (sessionId: string, events: readonly BaseEvent[]) => void
  readonly sessionExists: (sessionId: string) => boolean
  readonly listSessions: () => readonly string[]
  readonly db: SqliteDatabase
}

const RowWithPayloadSchema = z.array(z.object({ payload: z.string() }))
const RowWithSessionIdSchema = z.array(z.object({ session_id: z.string() }))

export function createStore(dbPath: string): SqliteEventStore {
  const db = openSqliteDatabase(dbPath)
  enableWalMode(db)
  db.exec(CREATE_TABLE_SQL)

  return {
    db,

    readEvents(sessionId: string): readonly BaseEvent[] {
      const rawRows = db
        .prepare('SELECT payload FROM events WHERE session_id = ? ORDER BY seq')
        .all(sessionId)
      const rows = RowWithPayloadSchema.parse(rawRows)
      return rows.map((row, index) => {
        const parsed: unknown = tryParsePayload(row.payload, index)
        const result = PassthroughEventSchema.safeParse(parsed)
        if (!result.success) {
          throw new WorkflowStateError(
            `Invalid event at index ${index} for session ${sessionId}: ${result.error.message}`
          )
        }
        return result.data
      })
    },

    appendEvents(sessionId: string, events: readonly BaseEvent[]): void {
      if (events.length === 0) return
      const insert = db.prepare(
        'INSERT INTO events (session_id, type, at, payload) VALUES (?, ?, ?, ?)'
      )
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const event of events) {
          insert.run(sessionId, event.type, event.at, JSON.stringify(event))
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    sessionExists(sessionId: string): boolean {
      const row = db
        .prepare('SELECT 1 FROM events WHERE session_id = ? LIMIT 1')
        .get(sessionId)
      return row !== undefined
    },

    listSessions(): readonly string[] {
      const rawRows = db
        .prepare('SELECT session_id FROM events GROUP BY session_id ORDER BY MIN(seq)')
        .all()
      const rows = RowWithSessionIdSchema.parse(rawRows)
      return rows.map((r) => r.session_id)
    },
  }
}

export function resolveSessionId(store: SqliteEventStore, input: string): string {
  if (store.sessionExists(input)) return input
  const allSessions = store.listSessions()
  const prefixMatches = allSessions.filter((s) => s.startsWith(input))
  const singleMatch = prefixMatches.length === 1 ? prefixMatches[0] : undefined
  if (singleMatch !== undefined) return singleMatch
  if (prefixMatches.length > 1) {
    throw new WorkflowStateError(
      `Ambiguous session prefix "${input}". Matches:\n${prefixMatches.map((s) => `  ${s}`).join('\n')}`,
    )
  }
  throw new WorkflowStateError(
    `No events found for session "${input}". Run "analyze --all" to list available sessions.`,
  )
}

function tryParsePayload(payload: string, index: number): unknown {
  try {
    return JSON.parse(payload)
  } catch (cause) {
    throw new WorkflowStateError(`Cannot parse event payload at index ${index}: ${String(cause)}`)
  }
}

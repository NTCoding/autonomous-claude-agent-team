import { EventRowSchema } from './query-types.js'
import type { ParsedEvent, EventRow } from './query-types.js'
import type { SqliteDatabase } from './sqlite-runtime.js'

export type SessionQueryDeps = {
  readonly db: SqliteDatabase
}

function parseEventRow(row: unknown): ParsedEvent {
  const validated = EventRowSchema.parse(row)
  return {
    seq: validated.seq,
    sessionId: validated.session_id,
    type: validated.type,
    at: validated.at,
    payload: JSON.parse(validated.payload) as Record<string, unknown>,
  }
}

export function getDistinctSessionIds(deps: SessionQueryDeps): ReadonlyArray<string> {
  const rows = deps.db
    .prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id')
    .all() as ReadonlyArray<{ session_id: string }>
  return rows.map((r) => r.session_id)
}

export function getSessionEvents(
  deps: SessionQueryDeps,
  sessionId: string,
): ReadonlyArray<ParsedEvent> {
  const rows = deps.db
    .prepare('SELECT seq, session_id, type, at, payload FROM events WHERE session_id = ? ORDER BY seq')
    .all(sessionId) as ReadonlyArray<EventRow>
  return rows.map(parseEventRow)
}

export function getSessionEventsPaginated(
  deps: SessionQueryDeps,
  sessionId: string,
  limit: number,
  offset: number,
  filters?: {
    readonly category?: string | undefined
    readonly type?: string | undefined
    readonly denied?: boolean | undefined
  },
): { readonly events: ReadonlyArray<ParsedEvent>; readonly total: number } {
  const conditions = ['session_id = ?']
  const params: Array<string | number> = [sessionId]

  if (filters?.type) {
    conditions.push('type = ?')
    params.push(filters.type)
  }

  const whereClause = conditions.join(' AND ')

  const countRow = deps.db
    .prepare(`SELECT COUNT(*) as count FROM events WHERE ${whereClause}`)
    .get(...params) as { count: number }

  const rows = deps.db
    .prepare(
      `SELECT seq, session_id, type, at, payload FROM events WHERE ${whereClause} ORDER BY seq LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ReadonlyArray<EventRow>

  return {
    events: rows.map(parseEventRow),
    total: countRow.count,
  }
}

export function getMaxSeq(deps: SessionQueryDeps): number {
  const row = deps.db.prepare('SELECT MAX(seq) as maxSeq FROM events').get() as {
    maxSeq: number | null
  }
  return row.maxSeq ?? 0
}

export function getEventsSinceSeq(
  deps: SessionQueryDeps,
  sinceSeq: number,
): ReadonlyArray<ParsedEvent> {
  const rows = deps.db
    .prepare(
      'SELECT seq, session_id, type, at, payload FROM events WHERE seq > ? ORDER BY seq',
    )
    .all(sinceSeq) as ReadonlyArray<EventRow>
  return rows.map(parseEventRow)
}

export function getSessionCount(deps: SessionQueryDeps): number {
  const row = deps.db
    .prepare('SELECT COUNT(DISTINCT session_id) as count FROM events')
    .get() as { count: number }
  return row.count
}

export function getTotalEventCount(deps: SessionQueryDeps): number {
  const row = deps.db.prepare('SELECT COUNT(*) as count FROM events').get() as {
    count: number
  }
  return row.count
}

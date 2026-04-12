import type { SessionQueryDeps } from './session-queries.js'
import { openSqliteDatabase, type SqliteDatabase } from './sqlite-runtime.js'

const WORKFLOW_STATES = ['SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING', 'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK', 'BLOCKED', 'COMPLETE']

export function createTestDb(): SqliteDatabase {
  const db = openSqliteDatabase(':memory:')
  db.exec(`
    CREATE TABLE events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `)
  return db
}

export function createTestQueryDeps(db?: SqliteDatabase): SessionQueryDeps {
  return { db: db ?? createTestDb() }
}

export function insertEvent(
  db: SqliteDatabase,
  sessionId: string,
  type: string,
  at: string,
  payload: Record<string, unknown> = {},
): void {
  db.prepare(
    'INSERT INTO events (session_id, type, at, payload) VALUES (?, ?, ?, ?)',
  ).run(sessionId, type, at, JSON.stringify({ type, at, ...payload }))
}

export function seedSessionEvents(db: SqliteDatabase, sessionId: string): void {
  insertEvent(db, sessionId, 'session-started', '2026-01-01T00:00:00Z', {
    repository: 'test/repo',
    currentState: 'SPAWN',
    states: WORKFLOW_STATES,
  })
  insertEvent(db, sessionId, 'transitioned', '2026-01-01T00:01:00Z', {
    from: 'idle',
    to: 'SPAWN',
  })
  insertEvent(db, sessionId, 'agent-registered', '2026-01-01T00:02:00Z', {
    agentType: 'lead',
    agentId: 'lead-1',
  })
  insertEvent(db, sessionId, 'transitioned', '2026-01-01T00:05:00Z', {
    from: 'SPAWN',
    to: 'PLANNING',
  })
  insertEvent(db, sessionId, 'journal-entry', '2026-01-01T00:06:00Z', {
    agentName: 'lead-1',
    content: 'Starting plan',
  })
  insertEvent(db, sessionId, 'write-checked', '2026-01-01T00:07:00Z', {
    tool: 'Write',
    filePath: '/src/test.ts',
    allowed: false,
    reason: 'Not in DEVELOPING state',
  })
  insertEvent(db, sessionId, 'transitioned', '2026-01-01T00:10:00Z', {
    from: 'PLANNING',
    to: 'DEVELOPING',
  })
}

export function seedMultipleSessions(db: SqliteDatabase): void {
  seedSessionEvents(db, 'session-a')
  seedSessionEvents(db, 'session-b')

  insertEvent(db, 'session-b', 'transitioned', '2026-01-01T00:15:00Z', {
    from: 'DEVELOPING',
    to: 'REVIEWING',
  })
  insertEvent(db, 'session-b', 'bash-checked', '2026-01-01T00:16:00Z', {
    tool: 'Bash',
    command: 'git push',
    allowed: false,
    reason: 'Not in COMMITTING state',
  })
}

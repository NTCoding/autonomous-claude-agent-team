import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unlinkSync, existsSync } from 'node:fs'
import { OpenCodeTranscriptReader } from './opencode-transcript-reader.js'

const TEST_DB = join(tmpdir(), 'opencode-transcript-reader-spec.db')

function createTestDb(): Database.Database {
  const db = new Database(TEST_DB)
  db.exec(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    )
  `)
  return db
}

function insertMessage(
  db: Database.Database,
  id: string,
  sessionId: string,
  role: string,
  parts: unknown[],
  timeCreated = 0,
): void {
  db.prepare(
    'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)',
  ).run(id, sessionId, timeCreated, JSON.stringify({ role, parts }))
}

beforeEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
})

afterEach(() => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
})

describe('OpenCodeTranscriptReader — database access', () => {
  it('returns empty array when database file does not exist', () => {
    const reader = new OpenCodeTranscriptReader('session-1')
    expect(reader.readMessages('/nonexistent/path/db.sqlite')).toStrictEqual([])
  })

  it('returns empty array for empty database', () => {
    createTestDb().close()
    const reader = new OpenCodeTranscriptReader('session-1')
    expect(reader.readMessages(TEST_DB)).toStrictEqual([])
  })
})

describe('OpenCodeTranscriptReader — message filtering', () => {
  it('ignores user messages', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-1', 'session-1', 'user', [{ type: 'text', text: 'Hello' }])
    db.close()
    expect(new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)).toStrictEqual([])
  })

  it('returns only messages for the given session ID', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-other', 'other-session', 'assistant', [{ type: 'text', text: 'Other' }])
    insertMessage(db, 'msg-mine', 'session-1', 'assistant', [{ type: 'text', text: 'Mine' }])
    db.close()
    const messages = new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.id).toStrictEqual('msg-mine')
  })
})

describe('OpenCodeTranscriptReader — message parsing', () => {
  it('extracts text content from assistant message', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-1', 'session-1', 'assistant', [
      { type: 'text', text: '📋 planning Task complete' },
    ])
    db.close()
    const messages = new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)
    expect(messages[0]).toStrictEqual({ id: 'msg-1', textContent: '📋 planning Task complete' })
  })

  it('returns undefined textContent for tool-only assistant messages', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-1', 'session-1', 'assistant', [
      { type: 'tool_call', name: 'bash', args: {} },
    ])
    db.close()
    expect(new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)[0]?.textContent).toBeUndefined()
  })

  it('extracts first text part from mixed-part messages', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-1', 'session-1', 'assistant', [
      { type: 'reasoning', text: 'internal thought' },
      { type: 'text', text: 'Final answer' },
    ])
    db.close()
    expect(new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)[0]?.textContent).toStrictEqual(
      'Final answer',
    )
  })

  it('skips messages with missing parts field', () => {
    const db = createTestDb()
    db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(
      'no-parts',
      'session-1',
      JSON.stringify({ role: 'assistant', text: 'no parts array here' }),
    )
    db.close()
    expect(new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)).toStrictEqual([])
  })

  it('returns messages ordered by time_created ascending', () => {
    const db = createTestDb()
    insertMessage(db, 'msg-late', 'session-1', 'assistant', [{ type: 'text', text: 'Second' }], 2000)
    insertMessage(db, 'msg-early', 'session-1', 'assistant', [{ type: 'text', text: 'First' }], 1000)
    db.close()
    const messages = new OpenCodeTranscriptReader('session-1').readMessages(TEST_DB)
    expect(messages).toStrictEqual([
      { id: 'msg-early', textContent: 'First' },
      { id: 'msg-late', textContent: 'Second' },
    ])
  })
})

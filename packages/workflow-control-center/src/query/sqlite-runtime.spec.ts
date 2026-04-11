import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { enableWalMode, openSqliteDatabase } from './sqlite-runtime.js'

const TEST_DB_PATH = join(tmpdir(), 'workflow-control-center-sqlite-runtime-spec.db')

afterEach(() => {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH)
  }
})

describe('sqlite-runtime', () => {
  it('opens database and executes statements', () => {
    const db = openSqliteDatabase(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    db.prepare('INSERT INTO t (value) VALUES (?)').run('ok')

    const row = db.prepare('SELECT COUNT(*) as count FROM t').get()
    const parsed = z.object({ count: z.number() }).parse(row)
    expect(parsed.count).toBe(1)

    db.close()
  })

  it('enables WAL mode', () => {
    const db = openSqliteDatabase(TEST_DB_PATH)

    enableWalMode(db)

    const row = db.prepare('PRAGMA journal_mode').get()
    const parsed = z.object({ journal_mode: z.string() }).parse(row)
    expect(parsed.journal_mode.length).toBeGreaterThan(0)

    db.close()
  })

  it('respects readonly mode', () => {
    const writable = openSqliteDatabase(TEST_DB_PATH)
    writable.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    writable.close()

    const readonly = openSqliteDatabase(TEST_DB_PATH, { readonly: true })
    expect(() => {
      readonly.prepare('INSERT INTO t (value) VALUES (?)').run('blocked')
    }).toThrow()
    readonly.close()
  })
})

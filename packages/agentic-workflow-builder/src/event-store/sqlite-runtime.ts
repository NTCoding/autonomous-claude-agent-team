import { createRequire } from 'node:module'

export type SqliteStatement = {
  readonly all: (...params: readonly unknown[]) => readonly unknown[]
  readonly get: (...params: readonly unknown[]) => unknown | undefined
  readonly run: (...params: readonly unknown[]) => unknown
}

export type SqliteDatabase = {
  readonly prepare: (sql: string) => SqliteStatement
  readonly exec: (sql: string) => void
  readonly close: () => void
}

type OpenOptions = {
  readonly readonly?: boolean
}

type SqliteFactory = {
  readonly open: (path: string, options: OpenOptions) => SqliteDatabase
}

const require = createRequire(import.meta.url)

const sqliteFactory: SqliteFactory = loadSqliteFactory()

export function openSqliteDatabase(path: string, options: OpenOptions = {}): SqliteDatabase {
  const db = sqliteFactory.open(path, options)
  return wrapSqliteDatabase(db)
}

export function enableWalMode(database: SqliteDatabase): void {
  database.exec('PRAGMA journal_mode = WAL')
}

function loadSqliteFactory(): SqliteFactory {
  /* v8 ignore next 3 */
  if (process.versions['bun'] !== undefined) {
    return loadBunSqliteFactory()
  }
  return loadNodeSqliteFactory()
}

/* v8 ignore start */
function loadBunSqliteFactory(): SqliteFactory {
  const bunSqliteModule: {
    readonly Database: new (path: string, options?: { readonly?: boolean }) => SqliteDatabase
  } = require('bun:sqlite')

  return {
    open(path: string, options: OpenOptions): SqliteDatabase {
      if (options.readonly === true) {
        return new bunSqliteModule.Database(path, { readonly: true })
      }
      return new bunSqliteModule.Database(path)
    },
  }
}
/* v8 ignore stop */

function loadNodeSqliteFactory(): SqliteFactory {
  const nodeSqliteModule: {
    readonly DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase
  } = require('node:sqlite')

  return {
    open(path: string, options: OpenOptions): SqliteDatabase {
      return new nodeSqliteModule.DatabaseSync(path, { readOnly: options.readonly === true })
    },
  }
}

function wrapSqliteDatabase(db: SqliteDatabase): SqliteDatabase {
  return {
    prepare: (sql: string) => wrapSqliteStatement(db.prepare(sql)),
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  }
}

function wrapSqliteStatement(statement: SqliteStatement): SqliteStatement {
  return {
    all: (...params: readonly unknown[]) => statement.all(...params),
    get: (...params: readonly unknown[]) => normalizeGetResult(statement.get(...params)),
    run: (...params: readonly unknown[]) => statement.run(...params),
  }
}

function normalizeGetResult(row: unknown): unknown | undefined {
  /* v8 ignore next */
  if (row === null) return undefined
  return row
}

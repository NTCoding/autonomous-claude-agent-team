import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEventWatcher } from './event-watcher.js'
import type { ParsedEvent } from '../query/query-types.js'
import {
  createTestDb,
  createTestQueryDeps,
  seedSessionEvents,
  insertEvent,
} from '../query/session-queries-test-fixtures.js'
import type { SqliteDatabase } from '../query/sqlite-runtime.js'

describe('createEventWatcher', () => {
  let db: SqliteDatabase

  beforeEach(() => {
    vi.useFakeTimers()
    db = createTestDb()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts and stops', () => {
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents: vi.fn(),
    })

    watcher.start()
    expect(watcher.isRunning()).toBe(true)

    watcher.stop()
    expect(watcher.isRunning()).toBe(false)
  })

  it('initializes lastSeenSeq on start', () => {
    seedSessionEvents(db, 'test-1')
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents: vi.fn(),
    })

    watcher.start()
    expect(watcher.lastSeenSeq()).toBe(7)
    watcher.stop()
  })

  it('detects new events on poll', () => {
    seedSessionEvents(db, 'test-1')
    const onNewEvents = vi.fn()
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents,
      pollIntervalMs: 100,
    })

    watcher.start()

    insertEvent(db, 'test-1', 'transitioned', '2026-01-01T00:15:00Z', {
      from: 'DEVELOPING',
      to: 'REVIEWING',
    })

    vi.advanceTimersByTime(100)
    expect(onNewEvents).toHaveBeenCalledTimes(1)

    const events = onNewEvents.mock.calls[0]?.[0] as ReadonlyArray<ParsedEvent>
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('transitioned')

    watcher.stop()
  })

  it('does not callback when no new events', () => {
    seedSessionEvents(db, 'test-1')
    const onNewEvents = vi.fn()
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents,
      pollIntervalMs: 100,
    })

    watcher.start()
    vi.advanceTimersByTime(100)
    expect(onNewEvents).not.toHaveBeenCalled()
    watcher.stop()
  })

  it('updates lastSeenSeq after detecting events', () => {
    seedSessionEvents(db, 'test-1')
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents: vi.fn(),
      pollIntervalMs: 100,
    })

    watcher.start()
    expect(watcher.lastSeenSeq()).toBe(7)

    insertEvent(db, 'test-1', 'journal-entry', '2026-01-01T00:15:00Z', {
      agentName: 'test',
      content: 'note',
    })

    vi.advanceTimersByTime(100)
    expect(watcher.lastSeenSeq()).toBe(8)
    watcher.stop()
  })

  it('ignores double start', () => {
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents: vi.fn(),
    })

    watcher.start()
    watcher.start()
    expect(watcher.isRunning()).toBe(true)
    watcher.stop()
  })

  it('handles SQLite errors during poll gracefully', () => {
    seedSessionEvents(db, 'test-1')
    const onNewEvents = vi.fn()
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents,
      pollIntervalMs: 100,
    })

    watcher.start()
    db.close()

    vi.advanceTimersByTime(100)
    expect(onNewEvents).not.toHaveBeenCalled()
    watcher.stop()
  })

  it('ignores double stop', () => {
    const watcher = createEventWatcher({
      queryDeps: createTestQueryDeps(db),
      onNewEvents: vi.fn(),
    })

    watcher.start()
    watcher.stop()
    watcher.stop()
    expect(watcher.isRunning()).toBe(false)
  })
})

import type { SessionQueryDeps } from '../query/session-queries.js'
import { getMaxSeq, getEventsSinceSeq } from '../query/session-queries.js'
import type { ParsedEvent } from '../query/query-types.js'

export type EventWatcherDeps = {
  readonly queryDeps: SessionQueryDeps
  readonly onNewEvents: (events: ReadonlyArray<ParsedEvent>) => void
  readonly pollIntervalMs?: number
}

export type EventWatcher = {
  readonly start: () => void
  readonly stop: () => void
  readonly isRunning: () => boolean
  readonly lastSeenSeq: () => number
}

export function createEventWatcher(deps: EventWatcherDeps): EventWatcher {
  const pollInterval = deps.pollIntervalMs ?? 500
  let interval: ReturnType<typeof setInterval> | undefined
  let currentSeq = 0
  let running = false

  function poll(): void {
    try {
      const newEvents = getEventsSinceSeq(deps.queryDeps, currentSeq)
      if (newEvents.length > 0) {
        const maxSeq = Math.max(...newEvents.map((e) => e.seq))
        currentSeq = maxSeq
        deps.onNewEvents(newEvents)
      }
    } catch {
      /* SQLite busy — retry next poll */
    }
  }

  return {
    start() {
      if (running) return
      running = true
      currentSeq = getMaxSeq(deps.queryDeps)
      interval = setInterval(poll, pollInterval)
    },

    stop() {
      if (!running) return
      running = false
      if (interval) {
        clearInterval(interval)
        interval = undefined
      }
    },

    isRunning() {
      return running
    },

    lastSeenSeq() {
      return currentSeq
    },
  }
}

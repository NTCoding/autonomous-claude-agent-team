import type { EventLogEntry } from './workflow-state.js'

export function createEventEntry(
  op: string,
  at: string,
  detail?: Record<string, unknown>,
): EventLogEntry {
  if (detail !== undefined) {
    return { op, at, detail }
  }
  return { op, at }
}

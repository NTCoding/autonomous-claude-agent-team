import { EngineEventSchema } from '@ntcoding/agentic-workflow-builder/engine'
import { DomainMetadataEventSchema } from '@ntcoding/agentic-workflow-builder/engine'
import type { EngineEvent } from '@ntcoding/agentic-workflow-builder/engine'
import type { DomainMetadataEvent } from '@ntcoding/agentic-workflow-builder/engine'
import type {
  ParsedEvent,
  SessionSummary,
  SessionStatus,
  PermissionDenials,
  StatePeriod,
  JournalEntry,
} from '../query/query-types.js'
import { deriveSessionStatus } from '../query/query-types.js'

export type SessionProjection = {
  readonly sessionId: string
  readonly currentState: string
  readonly totalEvents: number
  readonly firstEventAt: string
  readonly lastEventAt: string
  readonly activeAgents: ReadonlyArray<string>
  readonly transitionCount: number
  readonly permissionDenials: PermissionDenials
  readonly repository: string | undefined
  readonly issueNumber: number | undefined
  readonly featureBranch: string | undefined
  readonly prNumber: number | undefined
  readonly statePeriods: ReadonlyArray<StatePeriod>
  readonly journalEntries: ReadonlyArray<JournalEntry>
  readonly journalEntryCount: number
}

type MutableProjection = {
  sessionId: string
  currentState: string
  totalEvents: number
  firstEventAt: string
  lastEventAt: string
  activeAgents: Array<string>
  transitionCount: number
  permissionDenials: { write: number; bash: number; pluginRead: number; idle: number }
  repository: string | undefined
  issueNumber: number | undefined
  featureBranch: string | undefined
  prNumber: number | undefined
  statePeriods: Array<{
    state: string
    startedAt: string
    endedAt: string | undefined
    durationMs: number
  }>
  journalEntries: Array<JournalEntry>
  journalEntryCount: number
}

function createEmptyProjection(sessionId: string): MutableProjection {
  return {
    sessionId,
    currentState: 'idle',
    totalEvents: 0,
    firstEventAt: '',
    lastEventAt: '',
    activeAgents: [],
    transitionCount: 0,
    permissionDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    repository: undefined,
    issueNumber: undefined,
    featureBranch: undefined,
    prNumber: undefined,
    statePeriods: [],
    journalEntries: [],
    journalEntryCount: 0,
  }
}

function reconstructFlatEvent(event: ParsedEvent): Record<string, unknown> {
  return { type: event.type, at: event.at, ...event.payload }
}

function tryParseEngineEvent(event: ParsedEvent): EngineEvent | undefined {
  const flat = reconstructFlatEvent(event)
  const result = EngineEventSchema.safeParse(flat)
  return result.success ? result.data : undefined
}

function tryParseDomainMetadataEvent(event: ParsedEvent): DomainMetadataEvent | undefined {
  const flat = reconstructFlatEvent(event)
  const result = DomainMetadataEventSchema.safeParse(flat)
  return result.success ? result.data : undefined
}

function applyEngineEvent(projection: MutableProjection, event: EngineEvent): void {
  switch (event.type) {
    case 'session-started': {
      if (event.repository !== undefined && event.repository.length > 0) {
        projection.repository = event.repository
      }
      break
    }
    case 'transitioned': {
      projection.transitionCount++
      const lastPeriod = projection.statePeriods[projection.statePeriods.length - 1]
      if (lastPeriod && lastPeriod.endedAt === undefined) {
        lastPeriod.endedAt = event.at
        lastPeriod.durationMs =
          new Date(event.at).getTime() - new Date(lastPeriod.startedAt).getTime()
      }
      projection.statePeriods.push({
        state: event.to,
        startedAt: event.at,
        endedAt: undefined,
        durationMs: 0,
      })
      projection.currentState = event.to
      break
    }
    case 'agent-registered': {
      if (event.agentId.length > 0 && !projection.activeAgents.includes(event.agentId)) {
        projection.activeAgents.push(event.agentId)
      }
      break
    }
    case 'agent-shut-down': {
      const idx = projection.activeAgents.indexOf(event.agentName)
      if (idx >= 0) {
        projection.activeAgents.splice(idx, 1)
      }
      break
    }
    case 'journal-entry': {
      projection.journalEntryCount++
      projection.journalEntries.push({
        agentName: event.agentName,
        content: event.content,
        at: event.at,
        state: projection.currentState,
      })
      break
    }
    case 'write-checked': {
      if (!event.allowed) projection.permissionDenials.write++
      break
    }
    case 'bash-checked': {
      if (!event.allowed) projection.permissionDenials.bash++
      break
    }
    case 'plugin-read-checked': {
      if (!event.allowed) projection.permissionDenials.pluginRead++
      break
    }
    case 'idle-checked': {
      if (!event.allowed) projection.permissionDenials.idle++
      break
    }
    case 'identity-verified':
    case 'context-requested':
      break
  }
}

function applyDomainMetadataEvent(projection: MutableProjection, event: DomainMetadataEvent): void {
  switch (event.type) {
    case 'issue-recorded':
      projection.issueNumber = event.issueNumber
      break
    case 'branch-recorded':
      projection.featureBranch = event.branch
      break
    case 'pr-recorded':
      projection.prNumber = event.prNumber
      break
  }
}

function applyEventToProjection(projection: MutableProjection, event: ParsedEvent): void {
  projection.totalEvents++
  if (projection.firstEventAt === '') {
    projection.firstEventAt = event.at
  }
  projection.lastEventAt = event.at

  const engineEvent = tryParseEngineEvent(event)
  if (engineEvent !== undefined) {
    applyEngineEvent(projection, engineEvent)
    return
  }

  const metadataEvent = tryParseDomainMetadataEvent(event)
  if (metadataEvent !== undefined) {
    applyDomainMetadataEvent(projection, metadataEvent)
  }
}

export function projectSession(
  sessionId: string,
  events: ReadonlyArray<ParsedEvent>,
): SessionProjection {
  const projection = createEmptyProjection(sessionId)
  for (const event of events) {
    applyEventToProjection(projection, event)
  }
  return freezeProjection(projection)
}

export function projectSessionSummary(
  projection: SessionProjection,
  now: Date,
): SessionSummary {
  const durationMs =
    projection.firstEventAt && projection.lastEventAt
      ? new Date(projection.lastEventAt).getTime() -
        new Date(projection.firstEventAt).getTime()
      : 0

  const status: SessionStatus = projection.lastEventAt
    ? deriveSessionStatus(projection.lastEventAt, now)
    : 'completed'

  return {
    sessionId: projection.sessionId,
    currentState: projection.currentState,
    status,
    totalEvents: projection.totalEvents,
    firstEventAt: projection.firstEventAt,
    lastEventAt: projection.lastEventAt,
    durationMs,
    activeAgents: projection.activeAgents,
    transitionCount: projection.transitionCount,
    permissionDenials: projection.permissionDenials,
    repository: projection.repository,
    issueNumber: projection.issueNumber,
    featureBranch: projection.featureBranch,
    prNumber: projection.prNumber,
  }
}

function freezeProjection(mutable: MutableProjection): SessionProjection {
  return {
    sessionId: mutable.sessionId,
    currentState: mutable.currentState,
    totalEvents: mutable.totalEvents,
    firstEventAt: mutable.firstEventAt,
    lastEventAt: mutable.lastEventAt,
    activeAgents: [...mutable.activeAgents],
    transitionCount: mutable.transitionCount,
    permissionDenials: { ...mutable.permissionDenials },
    repository: mutable.repository,
    issueNumber: mutable.issueNumber,
    featureBranch: mutable.featureBranch,
    prNumber: mutable.prNumber,
    statePeriods: mutable.statePeriods.map((p) => ({ ...p })),
    journalEntries: [...mutable.journalEntries],
    journalEntryCount: mutable.journalEntryCount,
  }
}

export type ProjectionCache = {
  readonly get: (sessionId: string) => SessionProjection | undefined
  readonly set: (sessionId: string, projection: SessionProjection) => void
  readonly applyEvent: (event: ParsedEvent) => SessionProjection
  readonly evictStale: (now: Date) => number
  readonly size: () => number
}

const STALE_MS = 30 * 60 * 1000

export function createProjectionCache(): ProjectionCache {
  const cache = new Map<string, MutableProjection>()

  return {
    get(sessionId) {
      const p = cache.get(sessionId)
      return p ? freezeProjection(p) : undefined
    },

    set(sessionId, projection) {
      const mutable: MutableProjection = {
        ...projection,
        activeAgents: [...projection.activeAgents],
        permissionDenials: { ...projection.permissionDenials },
        statePeriods: projection.statePeriods.map((p) => ({ ...p })),
        journalEntries: [...projection.journalEntries],
      }
      cache.set(sessionId, mutable)
    },

    applyEvent(event) {
      const existing = cache.get(event.sessionId)
      if (existing) {
        applyEventToProjection(existing, event)
        return freezeProjection(existing)
      }
      const fresh = createEmptyProjection(event.sessionId)
      applyEventToProjection(fresh, event)
      cache.set(event.sessionId, fresh)
      return freezeProjection(fresh)
    },

    evictStale(now) {
      const threshold = now.getTime() - STALE_MS
      let evicted = 0
      for (const [id, p] of cache.entries()) {
        if (p.lastEventAt && new Date(p.lastEventAt).getTime() < threshold) {
          cache.delete(id)
          evicted++
        }
      }
      return evicted
    },

    size() {
      return cache.size
    },
  }
}

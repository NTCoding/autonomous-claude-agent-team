import { z } from 'zod'

export const EventRowSchema = z.object({
  seq: z.number(),
  session_id: z.string(),
  type: z.string(),
  at: z.string(),
  payload: z.string(),
})

export type EventRow = z.infer<typeof EventRowSchema>

export type ParsedEvent = {
  readonly seq: number
  readonly sessionId: string
  readonly type: string
  readonly at: string
  readonly payload: Record<string, unknown>
}

export type SessionStatus = 'active' | 'stale' | 'completed'

export type SessionSummary = {
  readonly sessionId: string
  readonly currentState: string
  readonly workflowStates: ReadonlyArray<string>
  readonly status: SessionStatus
  readonly totalEvents: number
  readonly firstEventAt: string
  readonly lastEventAt: string
  readonly durationMs: number
  readonly activeAgents: ReadonlyArray<string>
  readonly transitionCount: number
  readonly permissionDenials: PermissionDenials
  readonly repository: string | undefined
  readonly issueNumber: number | undefined
  readonly featureBranch: string | undefined
  readonly prNumber: number | undefined
}

export type PermissionDenials = {
  readonly write: number
  readonly bash: number
  readonly pluginRead: number
  readonly idle: number
}

export type SessionDetail = SessionSummary & {
  readonly journalEntries: ReadonlyArray<JournalEntry>
  readonly insights: ReadonlyArray<Insight>
  readonly suggestions: ReadonlyArray<Suggestion>
  readonly statePeriods: ReadonlyArray<StatePeriod>
}

export type StatePeriod = {
  readonly state: string
  readonly startedAt: string
  readonly endedAt: string | undefined
  readonly durationMs: number
}

export type JournalEntry = {
  readonly agentName: string
  readonly content: string
  readonly at: string
  readonly state: string
}

export type InsightSeverity = 'warning' | 'info' | 'success'

export type Insight = {
  readonly severity: InsightSeverity
  readonly title: string
  readonly evidence: string
  readonly prompt: string | undefined
}

export type Suggestion = {
  readonly title: string
  readonly rationale: string
  readonly change: string
  readonly tradeoff: string
  readonly prompt: string | undefined
}

export type EventCategory = 'transition' | 'agent' | 'permission' | 'journal' | 'session' | 'domain'

export type AnnotatedEvent = ParsedEvent & {
  readonly category: EventCategory
  readonly state: string
  readonly detail: string
  readonly denied: boolean | undefined
}

export type AnalyticsOverview = {
  readonly totalSessions: number
  readonly activeSessions: number
  readonly completedSessions: number
  readonly staleSessions: number
  readonly averageDurationMs: number
  readonly averageTransitionCount: number
  readonly averageDenialCount: number
  readonly totalEvents: number
  readonly denialHotspots: ReadonlyArray<DenialHotspot>
  readonly stateTimeDistribution: ReadonlyArray<StateTimeSegment>
}

export type DenialHotspot = {
  readonly target: string
  readonly count: number
}

export type StateTimeSegment = {
  readonly state: string
  readonly totalMs: number
  readonly percentage: number
}

export type TrendDataPoint = {
  readonly bucketStart: string
  readonly value: number
}

export type TrendBucket = 'day' | 'week'

export type RecurringPattern = {
  readonly insightTitle: string
  readonly sessionCount: number
  readonly percentage: number
  readonly exampleSessionIds: ReadonlyArray<string>
}

export type SessionComparison = {
  readonly sessionA: SessionDetail
  readonly sessionB: SessionDetail
  readonly deltas: ComparisonDeltas
}

export type ComparisonDeltas = {
  readonly durationMs: number
  readonly durationPercent: number
  readonly transitionCount: number
  readonly transitionPercent: number
  readonly totalDenials: number
  readonly denialPercent: number
  readonly eventCount: number
  readonly eventPercent: number
}

export const PERMISSION_EVENT_TYPES = [
  'write-checked',
  'bash-checked',
  'plugin-read-checked',
  'idle-checked',
] as const

export const AGENT_EVENT_TYPES = [
  'agent-registered',
  'agent-shut-down',
  'identity-verified',
  'context-requested',
] as const

export function categorizeEvent(type: string): EventCategory {
  if (type === 'transitioned') return 'transition'
  if (type === 'session-started') return 'session'
  if (type === 'journal-entry') return 'journal'
  if ((AGENT_EVENT_TYPES as ReadonlyArray<string>).includes(type)) return 'agent'
  if ((PERMISSION_EVENT_TYPES as ReadonlyArray<string>).includes(type)) return 'permission'
  return 'domain'
}

export function extractEventDetail(event: ParsedEvent): string {
  const p = event.payload
  switch (event.type) {
    case 'transitioned':
      return `${String(p['from'] ?? '?')} -> ${String(p['to'] ?? '?')}`
    case 'agent-registered':
      return `${String(p['agentType'] ?? '?')}: ${String(p['agentId'] ?? '?')}`
    case 'agent-shut-down':
      return String(p['agentName'] ?? '')
    case 'journal-entry': {
      const content = String(p['content'] ?? '')
      return `${String(p['agentName'] ?? '?')}: ${content.length > 60 ? content.slice(0, 60) + '...' : content}`
    }
    case 'write-checked':
      return String(p['filePath'] ?? '')
    case 'bash-checked': {
      const cmd = String(p['command'] ?? '')
      return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd
    }
    case 'plugin-read-checked':
      return String(p['path'] ?? '')
    case 'idle-checked':
      return String(p['agentName'] ?? '')
    case 'identity-verified':
      return String(p['status'] ?? '')
    case 'context-requested':
      return String(p['agentName'] ?? '')
    case 'session-started':
      return String(p['repository'] ?? '')
    default: {
      const firstStringValue = Object.values(p).find(
        (v): v is string => typeof v === 'string' && v !== event.type && v !== event.at,
      )
      return firstStringValue ?? event.type
    }
  }
}

export function isPermissionDenied(event: ParsedEvent): boolean | undefined {
  if (!(PERMISSION_EVENT_TYPES as ReadonlyArray<string>).includes(event.type)) return undefined
  return event.payload['allowed'] === false
}

const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export function deriveSessionStatus(lastEventAt: string, now: Date): SessionStatus {
  const elapsed = now.getTime() - new Date(lastEventAt).getTime()
  if (elapsed < ACTIVE_THRESHOLD_MS) return 'active'
  if (elapsed < STALE_THRESHOLD_MS) return 'stale'
  return 'completed'
}

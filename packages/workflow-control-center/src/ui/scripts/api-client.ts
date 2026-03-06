const BASE = ''

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json() as Promise<T>
}

export type SessionListResponse = {
  sessions: Array<SessionSummaryDto>
  total: number
}

export type SessionSummaryDto = {
  sessionId: string
  currentState: string
  status: string
  totalEvents: number
  firstEventAt: string
  lastEventAt: string
  durationMs: number
  activeAgents: Array<string>
  transitionCount: number
  permissionDenials: { write: number; bash: number; pluginRead: number; idle: number }
  repository?: string
}

export type SessionDetailDto = SessionSummaryDto & {
  journalEntries: Array<{ agentName: string; content: string; at: string; state: string }>
  insights: Array<{ severity: string; title: string; evidence: string }>
  statePeriods: Array<{ state: string; startedAt: string; endedAt?: string; durationMs: number }>
}

export type EventDto = {
  seq: number
  sessionId: string
  type: string
  at: string
  payload: Record<string, unknown>
  category: string
  state: string
  detail: string
  denied?: boolean
}

export type AnalyticsOverviewDto = {
  totalSessions: number
  activeSessions: number
  completedSessions: number
  staleSessions: number
  averageDurationMs: number
  averageTransitionCount: number
  averageDenialCount: number
  totalEvents: number
  denialHotspots: Array<{ target: string; count: number }>
  stateTimeDistribution: Array<{ state: string; totalMs: number; percentage: number }>
}

export type ComparisonDto = {
  sessionA: SessionDetailDto
  sessionB: SessionDetailDto
  deltas: {
    durationMs: number; durationPercent: number
    transitionCount: number; transitionPercent: number
    totalDenials: number; denialPercent: number
    eventCount: number; eventPercent: number
  }
}

export const api = {
  getSessions(params?: { status?: string; limit?: number; offset?: number }) {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    const qs = q.toString()
    return fetchJson<SessionListResponse>(`/api/sessions${qs ? '?' + qs : ''}`)
  },

  getSession(id: string) {
    return fetchJson<SessionDetailDto>(`/api/sessions/${id}`)
  },

  getSessionEvents(id: string, params?: { limit?: number; offset?: number; category?: string; type?: string; denied?: boolean }) {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    if (params?.category) q.set('category', params.category)
    if (params?.type) q.set('type', params.type)
    if (params?.denied !== undefined) q.set('denied', String(params.denied))
    const qs = q.toString()
    return fetchJson<{ events: Array<EventDto>; total: number }>(`/api/sessions/${id}/events${qs ? '?' + qs : ''}`)
  },

  getAnalyticsOverview() {
    return fetchJson<AnalyticsOverviewDto>('/api/analytics/overview')
  },

  getAnalyticsTrends(params: { metric: string; window: string; bucket: string }) {
    const q = new URLSearchParams(params)
    return fetchJson<{ dataPoints: Array<{ bucketStart: string; value: number }> }>(`/api/analytics/trends?${q}`)
  },

  getAnalyticsPatterns() {
    return fetchJson<{ patterns: Array<{ insightTitle: string; sessionCount: number; percentage: number; exampleSessionIds: Array<string> }> }>('/api/analytics/patterns')
  },

  getComparison(a: string, b: string) {
    return fetchJson<ComparisonDto>(`/api/analytics/compare?a=${a}&b=${b}`)
  },
}

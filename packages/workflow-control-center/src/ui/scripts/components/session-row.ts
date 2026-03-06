import { html, formatDuration, truncateId } from '../render.js'
import { renderTimelineBar } from './timeline-bar.js'
import type { SessionSummaryDto } from '../api-client.js'

export function renderSessionRow(session: SessionSummaryDto): string {
  const duration = formatDuration(session.durationMs)
  const agents = session.activeAgents.length

  return html`
    <div class="session-row" data-session-id="${session.sessionId}" onclick="window.location.hash='/session/${session.sessionId}'">
      <span class="session-id">${truncateId(session.sessionId)}</span>
      <span class="state-badge" data-state="${session.currentState}">${session.currentState}</span>
      <span>${agents} agents</span>
      <span>${duration}</span>
      <span class="status-badge ${session.status}">${session.status}</span>
      <span>${renderTimelineBar(session.durationMs > 0 ? [{ state: session.currentState, percentage: 100 }] : [])}</span>
    </div>
  `
}

export function renderSessionList(sessions: Array<SessionSummaryDto>): string {
  if (sessions.length === 0) {
    return html`<div class="loading">No sessions found</div>`
  }
  return html`<div class="session-list">${sessions.map(renderSessionRow).join('')}</div>`
}

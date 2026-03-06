import { html, esc, formatDuration, truncateId, stateCssClass, stateAbbrev } from '../render.js'
import type { SessionSummaryDto } from '../api-client.js'

export function renderSessionRow(session: SessionSummaryDto): string {
  const duration = formatDuration(session.durationMs)
  const totalDenials = session.permissionDenials.write + session.permissionDenials.bash +
    session.permissionDenials.pluginRead + session.permissionDenials.idle
  const denialWarn = totalDenials > 0 ? ' warn' : ''

  return html`<div class="session-row" onclick="window.location.hash='/session/${session.sessionId}'">` +
    html`<span class="session-id">${truncateId(session.sessionId)}</span>` +
    html`<span class="session-state"><span class="ev-badge ${stateCssClass(session.currentState)}">${esc(stateAbbrev(session.currentState))}</span></span>` +
    html`<span class="session-meta">${duration}</span>` +
    html`<span class="session-meta">${session.totalEvents} events</span>` +
    html`<span class="session-meta">${session.transitionCount} transitions</span>` +
    html`<span class="session-meta${denialWarn}">${totalDenials} denials</span>` +
    html`<span class="session-meta">${session.activeAgents.length} agents</span>` +
    `</div>`
}

export function renderSessionList(sessions: Array<SessionSummaryDto>): string {
  if (sessions.length === 0) {
    return html`<div class="loading">No sessions found</div>`
  }
  return html`<div class="session-list">${sessions.map(renderSessionRow).join('')}</div>`
}

import { html, formatDuration } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderSessionList } from '../components/session-row.js'
import { api } from '../api-client.js'
import type { SessionSummaryDto } from '../api-client.js'

export async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = html`<div class="loading">Loading sessions...</div>`

  try {
    const [activeData, completedData] = await Promise.all([
      api.getSessions({ status: 'active', limit: 50 }),
      api.getSessions({ limit: 20 }),
    ])

    const activeSessions = activeData.sessions
    const completedSessions = completedData.sessions.filter(
      (s: SessionSummaryDto) => s.status !== 'active',
    )

    const avgDuration = activeSessions.length > 0
      ? activeSessions.reduce((s: number, x: SessionSummaryDto) => s + x.durationMs, 0) / activeSessions.length
      : 0

    const totalDenials = [...activeSessions, ...completedSessions].reduce((s, x) =>
      s + x.permissionDenials.write + x.permissionDenials.bash + x.permissionDenials.pluginRead + x.permissionDenials.idle, 0)

    const metricsHtml = renderMetricCards([
      { label: 'Active Sessions', value: activeSessions.length },
      { label: 'Completed', value: completedSessions.length },
      { label: 'Avg Duration', value: formatDuration(avgDuration) },
      { label: 'Total Denials', value: totalDenials, warn: totalDenials > 0 },
    ])

    const activeListHtml = activeSessions.length > 0
      ? renderSessionList(activeSessions)
      : html`<div class="loading">No active sessions</div>`

    const completedListHtml = completedSessions.length > 0
      ? renderSessionList(completedSessions.slice(0, 10))
      : html`<div class="loading">No completed sessions</div>`

    container.innerHTML =
      html`<div class="section">${metricsHtml}</div>` +
      html`<div class="section"><div class="slabel">Active Sessions</div>${activeListHtml}</div>` +
      html`<div class="section"><div class="slabel">Recent Completions</div>${completedListHtml}</div>`
  } catch (err) {
    container.innerHTML = html`<div class="loading">Error loading sessions: ${err instanceof Error ? err.message : 'Unknown error'}</div>`
  }
}

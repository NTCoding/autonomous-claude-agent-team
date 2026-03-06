import { html, $, formatDuration } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderSessionList } from '../components/session-row.js'
import { api } from '../api-client.js'
import type { SessionSummaryDto } from '../api-client.js'
import { setState, getState } from '../state.js'

export async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = html`
    <h1 class="page-title">Dashboard</h1>
    <div id="metrics-area" class="section"></div>
    <div class="section">
      <h2 class="section-title">Active Sessions</h2>
      <div id="compare-controls" style="display:none">
        <button class="compare-btn" id="compare-btn" disabled>Compare Selected</button>
      </div>
      <div id="active-sessions" class="loading">Loading...</div>
    </div>
    <div class="section">
      <h2 class="section-title">Recent Completions</h2>
      <div id="completed-sessions" class="loading">Loading...</div>
    </div>
  `

  try {
    setState({ loading: true })
    const [activeData, completedData] = await Promise.all([
      api.getSessions({ status: 'active', limit: 50 }),
      api.getSessions({ limit: 10 }),
    ])

    const activeSessions = activeData.sessions
    const completedSessions = completedData.sessions.filter(
      (s: SessionSummaryDto) => s.status !== 'active',
    )

    setState({ sessions: [...activeSessions, ...completedSessions], loading: false })

    const metricsArea = $('#metrics-area')
    if (metricsArea) {
      metricsArea.innerHTML = renderMetricCards([
        { label: 'Active Sessions', value: activeSessions.length },
        { label: 'Completed Today', value: completedSessions.length },
        { label: 'Avg Duration', value: formatDuration(
          activeSessions.length > 0
            ? activeSessions.reduce((s: number, x: SessionSummaryDto) => s + x.durationMs, 0) / activeSessions.length
            : 0
        )},
      ])
    }

    const activeEl = $('#active-sessions')
    if (activeEl) {
      activeEl.innerHTML = renderSessionList(activeSessions)
    }

    const completedEl = $('#completed-sessions')
    if (completedEl) {
      completedEl.innerHTML = renderSessionList(completedSessions.slice(0, 10))
    }
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : 'Unknown error', loading: false })
    const activeEl = $('#active-sessions')
    if (activeEl) {
      activeEl.innerHTML = html`<div class="loading">Error loading sessions</div>`
    }
  }
}

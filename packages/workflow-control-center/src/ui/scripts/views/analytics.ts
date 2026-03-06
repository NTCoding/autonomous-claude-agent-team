import { html, $, formatDuration, stateColor } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderLineChart, renderBarChart, renderStackedBar } from '../components/chart.js'
import { api } from '../api-client.js'

export async function renderAnalytics(container: HTMLElement): Promise<void> {
  container.innerHTML = html`
    <h1 class="page-title">Analytics</h1>
    <div class="window-selector">
      <button class="window-btn" data-window="7d">7d</button>
      <button class="window-btn active" data-window="30d">30d</button>
      <button class="window-btn" data-window="90d">90d</button>
    </div>
    <div id="analytics-content" class="loading">Loading analytics...</div>
  `

  let currentWindow = '30d'
  loadAnalytics(container, currentWindow)

  container.querySelectorAll('.window-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.window-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      currentWindow = (btn as HTMLElement).dataset['window'] ?? '30d'
      loadAnalytics(container, currentWindow)
    })
  })
}

async function loadAnalytics(container: HTMLElement, window: string): Promise<void> {
  const content = container.querySelector('#analytics-content') as HTMLElement
  if (!content) return

  try {
    const [overview, durationTrend, denialTrend, patterns] = await Promise.all([
      api.getAnalyticsOverview(),
      api.getAnalyticsTrends({ metric: 'duration', window, bucket: 'day' }),
      api.getAnalyticsTrends({ metric: 'denials', window, bucket: 'day' }),
      api.getAnalyticsPatterns(),
    ])

    const durationPoints = durationTrend.dataPoints.map((p, i) => ({ x: i, y: p.value }))
    const denialPoints = denialTrend.dataPoints.map((p, i) => ({ x: i, y: p.value }))

    const hotspotBars = overview.denialHotspots.map((h) => ({
      label: h.target,
      value: h.count,
    }))

    const stateSegments = overview.stateTimeDistribution.map((s) => ({
      label: s.state,
      value: s.totalMs,
      color: stateColor(s.state),
    }))

    content.innerHTML = html`
      <div class="section">
        ${renderMetricCards([
          { label: 'Total Sessions', value: overview.totalSessions },
          { label: 'Avg Duration', value: formatDuration(overview.averageDurationMs) },
          { label: 'Avg Denials', value: overview.averageDenialCount },
          { label: 'Total Events', value: overview.totalEvents },
        ])}
      </div>

      <div class="section grid grid-2">
        <div class="chart-container">
          <h3 class="section-title">Session Duration Trend</h3>
          ${renderLineChart(durationPoints, { title: 'Duration (ms)', width: 400, height: 200 })}
        </div>
        <div class="chart-container">
          <h3 class="section-title">Denial Count Trend</h3>
          ${renderLineChart(denialPoints, { title: 'Denials', width: 400, height: 200 })}
        </div>
      </div>

      <div class="section">
        <h3 class="section-title">Recurring Patterns</h3>
        ${patterns.patterns.length > 0 ? html`
          <table class="data-table">
            <thead><tr><th>Pattern</th><th>Sessions</th><th>%</th><th>Examples</th></tr></thead>
            <tbody>
              ${patterns.patterns.map((p) => html`
                <tr>
                  <td>${p.insightTitle}</td>
                  <td>${p.sessionCount}</td>
                  <td>${p.percentage}%</td>
                  <td>${p.exampleSessionIds.map((id) => html`<a href="#/session/${id}" class="session-id">${id.slice(0, 8)}</a> `).join('')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : html`<div class="loading">No recurring patterns</div>`}
      </div>

      <div class="section grid grid-2">
        <div class="chart-container">
          <h3 class="section-title">Denial Hotspots</h3>
          ${renderBarChart(hotspotBars, 'horizontal')}
        </div>
        <div class="chart-container">
          <h3 class="section-title">State Time Distribution</h3>
          ${renderStackedBar(stateSegments)}
        </div>
      </div>
    `
  } catch {
    content.innerHTML = html`<div class="loading">Error loading analytics</div>`
  }
}

import { html, formatDuration, stateColor } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderTimelineBar, computeTimelineSegments } from '../components/timeline-bar.js'
import { renderInsights } from '../components/insight-cards.js'
import { renderStackedBar } from '../components/chart.js'
import { api } from '../api-client.js'

export async function renderSessionCompare(container: HTMLElement, idA: string, idB: string): Promise<void> {
  container.innerHTML = html`<div class="loading">Comparing sessions...</div>`

  try {
    const comparison = await api.getComparison(idA, idB)
    const { sessionA, sessionB, deltas } = comparison

    const segmentsA = computeTimelineSegments(sessionA.statePeriods)
    const segmentsB = computeTimelineSegments(sessionB.statePeriods)

    const stateDistA = sessionA.statePeriods.map((p) => ({ label: p.state, value: p.durationMs, color: stateColor(p.state) }))
    const stateDistB = sessionB.statePeriods.map((p) => ({ label: p.state, value: p.durationMs, color: stateColor(p.state) }))

    function deltaStr(value: number, pct: number): string {
      const sign = value >= 0 ? '+' : ''
      const cls = Math.abs(pct) > 20 ? 'delta-highlight' : ''
      return html`<span class="${cls}">${sign}${value} (${sign}${pct}%)</span>`
    }

    container.innerHTML = html`
      <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-lg)">
        <a href="#/" style="color:var(--color-text-dim);text-decoration:none">&larr;</a>
        <h1 class="page-title" style="margin:0">Session Comparison</h1>
      </div>

      <div class="section">
        <h3 class="section-title">Metrics</h3>
        <table class="data-table">
          <thead><tr><th>Metric</th><th>Session A</th><th>Session B</th><th>Delta</th></tr></thead>
          <tbody>
            <tr><td>Duration</td><td>${formatDuration(sessionA.durationMs)}</td><td>${formatDuration(sessionB.durationMs)}</td><td>${deltaStr(deltas.durationMs, deltas.durationPercent)}</td></tr>
            <tr><td>Transitions</td><td>${sessionA.transitionCount}</td><td>${sessionB.transitionCount}</td><td>${deltaStr(deltas.transitionCount, deltas.transitionPercent)}</td></tr>
            <tr><td>Events</td><td>${sessionA.totalEvents}</td><td>${sessionB.totalEvents}</td><td>${deltaStr(deltas.eventCount, deltas.eventPercent)}</td></tr>
            <tr><td>Denials</td><td>${sessionA.permissionDenials.write + sessionA.permissionDenials.bash}</td><td>${sessionB.permissionDenials.write + sessionB.permissionDenials.bash}</td><td>${deltaStr(deltas.totalDenials, deltas.denialPercent)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="section compare-grid">
        <div>
          <h3 class="section-title">Session A: ${sessionA.sessionId.slice(0, 8)}</h3>
          ${renderTimelineBar(segmentsA)}
          <div style="margin-top:var(--space-md)">${renderStackedBar(stateDistA)}</div>
        </div>
        <div>
          <h3 class="section-title">Session B: ${sessionB.sessionId.slice(0, 8)}</h3>
          ${renderTimelineBar(segmentsB)}
          <div style="margin-top:var(--space-md)">${renderStackedBar(stateDistB)}</div>
        </div>
      </div>

      <div class="section compare-grid">
        <div>
          <h3 class="section-title">Insights A</h3>
          ${renderInsights(sessionA.insights)}
        </div>
        <div>
          <h3 class="section-title">Insights B</h3>
          ${renderInsights(sessionB.insights)}
        </div>
      </div>
    `
  } catch {
    container.innerHTML = html`<div class="loading">Error comparing sessions</div>`
  }
}

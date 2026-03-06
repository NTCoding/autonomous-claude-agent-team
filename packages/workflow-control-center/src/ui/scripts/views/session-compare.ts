import { html, esc, formatDuration, stateColor } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderTimelineBar, computeTimelineSegments } from '../components/timeline-bar.js'
import { renderInsights, attachInsightListeners } from '../components/insight-cards.js'
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
      const style = Math.abs(pct) > 20 ? ' style="font-weight:600;color:#d35400"' : ''
      return html`<span${style}>${sign}${value} (${sign}${pct}%)</span>`
    }

    container.innerHTML =
      html`<div class="header" style="margin:-20px -24px 0;padding:10px 24px"><div class="header-row">` +
      html`<a href="#/" class="page-back">← Sessions</a>` +
      html`<span class="sep">│</span>` +
      html`<h1>Session Comparison</h1>` +
      html`</div></div>` +
      html`<div style="padding:20px 0">` +
        html`<div class="section"><div class="slabel">Metrics</div>` +
        html`<table class="data-table">` +
          html`<thead><tr><th>Metric</th><th>Session A</th><th>Session B</th><th>Delta</th></tr></thead>` +
          html`<tbody>` +
          html`<tr><td>Duration</td><td>${formatDuration(sessionA.durationMs)}</td><td>${formatDuration(sessionB.durationMs)}</td><td>${deltaStr(deltas.durationMs, deltas.durationPercent)}</td></tr>` +
          html`<tr><td>Transitions</td><td>${sessionA.transitionCount}</td><td>${sessionB.transitionCount}</td><td>${deltaStr(deltas.transitionCount, deltas.transitionPercent)}</td></tr>` +
          html`<tr><td>Events</td><td>${sessionA.totalEvents}</td><td>${sessionB.totalEvents}</td><td>${deltaStr(deltas.eventCount, deltas.eventPercent)}</td></tr>` +
          html`<tr><td>Denials</td><td>${sessionA.permissionDenials.write + sessionA.permissionDenials.bash}</td><td>${sessionB.permissionDenials.write + sessionB.permissionDenials.bash}</td><td>${deltaStr(deltas.totalDenials, deltas.denialPercent)}</td></tr>` +
          html`</tbody></table></div>` +
        html`<div class="section compare-grid">` +
          html`<div><div class="slabel">Session A: ${sessionA.sessionId.slice(0, 8)}</div>${renderTimelineBar(segmentsA)}<div style="margin-top:12px">${renderStackedBar(stateDistA)}</div></div>` +
          html`<div><div class="slabel">Session B: ${sessionB.sessionId.slice(0, 8)}</div>${renderTimelineBar(segmentsB)}<div style="margin-top:12px">${renderStackedBar(stateDistB)}</div></div>` +
        html`</div>` +
        html`<div class="section compare-grid">` +
          html`<div><div class="slabel">Insights A</div>${renderInsights(sessionA.insights)}</div>` +
          html`<div><div class="slabel">Insights B</div>${renderInsights(sessionB.insights)}</div>` +
        html`</div>` +
      html`</div>`

    attachInsightListeners(container)
  } catch {
    container.innerHTML = html`<div class="loading">Error comparing sessions</div>`
  }
}

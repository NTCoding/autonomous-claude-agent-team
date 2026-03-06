import { html } from '../render.js'

type InsightData = {
  severity: string
  title: string
  evidence: string
}

export function renderInsightCard(insight: InsightData): string {
  return html`
    <div class="insight-card ${insight.severity}">
      <div class="insight-title">${insight.severity === 'warning' ? '⚠️' : insight.severity === 'success' ? '✅' : 'ℹ️'} ${insight.title}</div>
      <div class="insight-evidence">${insight.evidence}</div>
    </div>
  `
}

export function renderInsights(insights: Array<InsightData>): string {
  if (insights.length === 0) {
    return html`<div class="loading">No insights</div>`
  }
  return html`<div style="display:flex;flex-direction:column;gap:var(--space-sm)">${insights.map(renderInsightCard).join('')}</div>`
}

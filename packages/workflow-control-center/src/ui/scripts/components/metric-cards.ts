import { html, formatDuration } from '../render.js'

type MetricCardData = {
  label: string
  value: string | number
  delta?: string
  deltaDirection?: 'positive' | 'negative' | 'neutral'
}

export function renderMetricCard(data: MetricCardData): string {
  const deltaHtml = data.delta
    ? html`<div class="delta ${data.deltaDirection === 'positive' ? 'delta-positive' : data.deltaDirection === 'negative' ? 'delta-negative' : ''}">${data.delta}</div>`
    : ''

  return html`
    <div class="metric-card">
      <div class="label">${data.label}</div>
      <div class="value">${data.value}</div>
      ${deltaHtml}
    </div>
  `
}

export function renderMetricCards(metrics: Array<MetricCardData>): string {
  return html`<div class="grid grid-${metrics.length}">${metrics.map(renderMetricCard).join('')}</div>`
}

export function durationMetric(ms: number): string {
  return formatDuration(ms)
}

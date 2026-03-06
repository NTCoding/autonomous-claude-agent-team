import { html } from '../render.js'

type MetricCardData = {
  label: string
  value: string | number
  warn?: boolean
  drillDown?: { dimension: string; value: string }
}

export function renderMetricCards(metrics: Array<MetricCardData>): string {
  const items = metrics.map((m) => {
    const warnClass = m.warn ? ' warn' : ''
    const linkClass = m.drillDown ? ' metric-link' : ''
    const drillAttr = m.drillDown
      ? ` data-drill-dim="${m.drillDown.dimension}" data-drill-val="${m.drillDown.value}"`
      : ''
    return `<div class="metric${warnClass}${linkClass}"${drillAttr}><div class="metric-val">${String(m.value)}</div><div class="metric-label">${m.label}</div></div>`
  }).join('')
  return html`<div class="metrics">${items}</div>`
}

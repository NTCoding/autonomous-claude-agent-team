import { html, esc } from '../render.js'

type MetricCardData = {
  label: string
  value: string | number
  warn?: boolean
  drillDown?: { dimension: string; value: string }
  tooltip?: string
}

export function renderMetricCards(metrics: Array<MetricCardData>): string {
  const items = metrics.map((m) => {
    const warnClass = m.warn ? ' warn' : ''
    const linkClass = m.drillDown ? ' metric-link' : ''
    const tooltipClass = m.tooltip ? ' has-tooltip' : ''
    const drillAttr = m.drillDown
      ? ` data-drill-dim="${m.drillDown.dimension}" data-drill-val="${m.drillDown.value}"`
      : ''
    const tooltipHtml = m.tooltip
      ? `<div class="metric-tooltip">${esc(m.tooltip)}</div>`
      : ''
    return `<div class="metric${warnClass}${linkClass}${tooltipClass}"${drillAttr}><div class="metric-val">${String(m.value)}</div><div class="metric-label">${m.label}</div>${tooltipHtml}</div>`
  }).join('')
  return html`<div class="metrics">${items}</div>`
}

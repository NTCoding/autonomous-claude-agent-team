import { html, stateCssClass, formatDuration } from '../render.js'

type TimelineSegment = {
  state: string
  durationMs: number
  proportionOfTotal: number
}

export function renderTimelineBar(segments: Array<TimelineSegment>, states?: Array<string>): string {
  const stateTotals = segments.reduce<Record<string, number>>((acc, s) => ({
    ...acc,
    [s.state]: (acc[s.state] ?? 0) + s.durationMs,
  }), {})

  const legendStates = states !== undefined && states.length > 0
    ? states
    : [...new Set(segments.map((s) => s.state))]

  const legendItems = legendStates.map((state) => {
    const css = stateCssClass(state)
    const dur = stateTotals[state] ?? 0
    return html`<label class="tl-toggle"><input type="checkbox" checked data-tl-state="${css}">`
      + html`<i class="${css}"></i>${state} <span class="tl-dur">${formatDuration(dur)}</span></label>`
  }).join('')

  if (segments.length === 0) {
    return html`<div class="timeline-bar"></div><div class="tl-legend">${legendItems}</div>`
  }

  const segmentHtml = segments
    .map((s) => {
      const flex = Math.max(s.proportionOfTotal * 100, 0.5)
      return html`<div class="tl-seg ${stateCssClass(s.state)}" style="flex:${flex}" title="${s.state} — ${formatDuration(s.durationMs)}"></div>`
    })
    .join('')

  return html`<div class="timeline-bar">${segmentHtml}</div><div class="tl-legend">${legendItems}</div>`
}

export function attachTimelineListeners(): void {
  document.querySelectorAll('.tl-toggle input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const css = (cb as HTMLInputElement).dataset['tlState'] ?? ''
      const checked = (cb as HTMLInputElement).checked
      document.querySelectorAll(`.tl-seg.${css}`).forEach((seg) => {
        (seg as HTMLElement).style.display = checked ? '' : 'none'
      })
    })
  })
}

export function computeTimelineSegments(
  statePeriods: Array<{ state: string; durationMs: number }>,
): Array<TimelineSegment> {
  const totalMs = statePeriods.reduce((sum, p) => sum + p.durationMs, 0)
  if (totalMs === 0) return []

  return statePeriods.map((p) => ({
    state: p.state,
    durationMs: p.durationMs,
    proportionOfTotal: p.durationMs / totalMs,
  }))
}

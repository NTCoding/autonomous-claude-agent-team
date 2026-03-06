import { html, stateColor } from '../render.js'

type TimelineSegment = {
  state: string
  percentage: number
}

export function renderTimelineBar(segments: Array<TimelineSegment>): string {
  if (segments.length === 0) {
    return html`<div class="timeline-bar"></div>`
  }

  const segmentHtml = segments
    .map(
      (s) =>
        html`<div class="timeline-segment" style="width:${s.percentage}%;background:${stateColor(s.state)}" title="${s.state}: ${s.percentage}%"></div>`,
    )
    .join('')

  return html`<div class="timeline-bar">${segmentHtml}</div>`
}

export function computeTimelineSegments(
  statePeriods: Array<{ state: string; durationMs: number }>,
): Array<TimelineSegment> {
  const totalMs = statePeriods.reduce((sum, p) => sum + p.durationMs, 0)
  if (totalMs === 0) return []

  return statePeriods.map((p) => ({
    state: p.state,
    percentage: Math.round((p.durationMs / totalMs) * 100),
  }))
}

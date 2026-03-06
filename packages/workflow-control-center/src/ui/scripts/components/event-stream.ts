import { html, formatTime } from '../render.js'
import type { EventDto } from '../api-client.js'

export function renderEventRow(event: EventDto): string {
  const deniedClass = event.denied === true ? 'event-denied' : event.denied === false ? 'event-allowed' : ''

  return html`
    <div class="event-row">
      <span class="event-seq">#${event.seq}</span>
      <span class="event-time">${formatTime(event.at)}</span>
      <span class="event-type">${event.type}</span>
      <span class="${deniedClass}">${event.denied === true ? 'DENIED' : event.denied === false ? 'allowed' : event.state}</span>
      <span>${event.detail}</span>
    </div>
  `
}

export function renderEventStream(events: Array<EventDto>, total: number): string {
  return html`
    <div>
      <div style="font-size:12px;color:var(--color-text-dim);margin-bottom:var(--space-sm)">${total} events</div>
      ${events.map(renderEventRow).join('')}
    </div>
  `
}

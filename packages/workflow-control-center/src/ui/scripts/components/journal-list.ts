import { html, formatTime, esc, agentColor } from '../render.js'

type JournalData = {
  agentName: string
  content: string
  at: string
  state: string
}

export function renderJournalEntry(entry: JournalData): string {
  const color = agentColor(entry.agentName)
  return html`<div class="journal-entry" style="border-left-color:${color}">` +
    html`<div class="journal-meta"><span class="journal-agent">${esc(entry.agentName)}</span><span>${formatTime(entry.at)}</span><span>${esc(entry.state)}</span></div>` +
    html`<div class="journal-text">"${esc(entry.content)}"</div>` +
    `</div>`
}

export function renderJournalList(entries: Array<JournalData>): string {
  if (entries.length === 0) {
    return html`<div class="loading">No journal entries</div>`
  }
  return entries.map(renderJournalEntry).join('')
}

import { html, formatTime, agentColor } from '../render.js'

type JournalData = {
  agentName: string
  content: string
  at: string
  state: string
}

export function renderJournalEntry(entry: JournalData): string {
  const color = agentColor(entry.agentName)
  return html`
    <div class="journal-entry">
      <div>
        <span class="journal-agent" style="color:${color}">${entry.agentName}</span>
        <div style="font-size:11px;color:var(--color-text-muted)">${formatTime(entry.at)} · ${entry.state}</div>
      </div>
      <div class="journal-content">${entry.content}</div>
    </div>
  `
}

export function renderJournalList(entries: Array<JournalData>): string {
  if (entries.length === 0) {
    return html`<div class="loading">No journal entries</div>`
  }
  return entries.map(renderJournalEntry).join('')
}

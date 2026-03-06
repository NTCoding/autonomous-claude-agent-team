import { html, formatTime, esc, stateBadge } from '../render.js'
import type { EventDto } from '../api-client.js'

function categorizeEvent(type: string): string {
  if (type === 'transitioned') return 'transition'
  if (type === 'journal-entry') return 'journal'
  if (type.startsWith('agent-') || type === 'identity-verified' || type === 'context-requested') return 'agent'
  if (type.includes('denied') || type.includes('allowed') || type.includes('permission')) return 'permission'
  return 'other'
}

function extractOutcome(event: EventDto): string | undefined {
  if (event.denied === true) return 'denied'
  if (event.denied === false) return 'approved'
  return undefined
}

function renderLogEntry(event: EventDto, index: number): string {
  const outcome = extractOutcome(event)
  const category = categorizeEvent(event.type)
  const time = formatTime(event.at)
  const rowClasses = [
    'le',
    outcome === 'denied' ? 'denied' : '',
    category === 'journal' ? 'journal' : '',
  ].filter(Boolean).join(' ')

  const outcomeHtml = outcome
    ? html`<span class="le-outcome ${outcome}">${outcome.toUpperCase()}</span>`
    : ''

  const detailHtml = event.detail
    ? html`<span class="le-fields"><span class="ev-f"><span class="ev-fv">${esc(event.detail)}</span></span></span>`
    : ''

  return html`<div class="${rowClasses}" data-idx="${index}" data-cat="${category}" data-state="${esc(event.state)}" data-outcome="${outcome ?? 'none'}">` +
    html`<span class="le-time">${time}</span>` +
    stateBadge(event.state) +
    html`<span class="le-name">${esc(event.type)}</span>` +
    outcomeHtml + detailHtml +
    `</div>`
}

type FacetCounts = {
  cat: Record<string, number>
  state: Record<string, number>
  outcome: Record<string, number>
}

function buildFacetCounts(events: Array<EventDto>): FacetCounts {
  const cat: Record<string, number> = {}
  const state: Record<string, number> = {}
  const outcome: Record<string, number> = {}

  for (const e of events) {
    const c = categorizeEvent(e.type)
    cat[c] = (cat[c] ?? 0) + 1
    state[e.state] = (state[e.state] ?? 0) + 1
    const o = extractOutcome(e)
    if (o) outcome[o] = (outcome[o] ?? 0) + 1
  }

  return { cat, state, outcome }
}

function renderFacetGroup(title: string, dimension: string, counts: Record<string, number>, total: number): string {
  const items = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([value, count]) => {
      const pct = (count / total) * 100
      return html`<div class="facet-item" data-dimension="${dimension}" data-value="${esc(value)}">` +
        html`<span>${esc(value)}</span>` +
        html`<div class="facet-bar"><div class="facet-bar-fill" style="width:${pct}%"></div></div>` +
        html`<span class="facet-ct">${count}</span></div>`
    }).join('')
  return html`<div class="facet-group"><div class="facet-title">${esc(title)}</div>${items}</div>`
}

export function renderEventStream(events: Array<EventDto>, total: number): string {
  const facets = buildFacetCounts(events)
  const logEntries = events.map((e, i) => renderLogEntry(e, i)).join('')

  const sidebar = renderFacetGroup('Category', 'cat', facets.cat, events.length) +
    renderFacetGroup('State', 'state', facets.state, events.length) +
    renderFacetGroup('Outcome', 'outcome', facets.outcome, events.length)

  return html`<div class="log-explorer">` +
    html`<div class="log-search"><input type="text" placeholder="Search events..." id="log-search-input"><span class="result-count" id="log-count">${total} events</span></div>` +
    html`<div class="log-facets">${sidebar}</div>` +
    html`<div class="log-entries" id="log-entries">${logEntries}</div>` +
    `</div>`
}

export function attachEventStreamListeners(): void {
  const searchInput = document.getElementById('log-search-input') as HTMLInputElement | null
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase()
      const entries = document.querySelectorAll('#log-entries .le')
      let visible = 0
      entries.forEach((el) => {
        const match = !query || (el.textContent ?? '').toLowerCase().includes(query)
        ;(el as HTMLElement).classList.toggle('hidden', !match)
        if (match) visible++
      })
      const countEl = document.getElementById('log-count')
      if (countEl) countEl.textContent = `${visible} events`
    })
  }

  document.querySelectorAll('.facet-item').forEach((el) => {
    el.addEventListener('click', () => {
      const dimension = (el as HTMLElement).dataset['dimension'] ?? ''
      const value = (el as HTMLElement).dataset['value'] ?? ''
      el.classList.toggle('active')
      filterByFacets(dimension, value)
    })
  })

  document.querySelectorAll('#log-entries .le').forEach((el) => {
    el.addEventListener('click', () => {
      const wasExpanded = el.classList.contains('expanded')
      document.querySelectorAll('#log-entries .le.expanded').forEach((prev) => {
        prev.classList.remove('expanded')
        const detail = prev.querySelector('.le-detail')
        if (detail) prev.removeChild(detail)
      })
      if (wasExpanded) return
      const idx = parseInt((el as HTMLElement).dataset['idx'] ?? '0', 10)
      const storedEvents = (window as unknown as Record<string, unknown>)['__events'] as Array<EventDto> | undefined
      if (!storedEvents?.[idx]) return
      const evt = storedEvents[idx]
      if (!evt) return
      const payload = evt.payload as Record<string, unknown>
      const displayFields: Array<[string, string]> = [
        ['type', evt.type],
        ['time', evt.at],
        ['state', evt.state],
      ]
      if (evt.category) displayFields.push(['category', evt.category])
      if (evt.denied !== undefined) displayFields.push(['denied', String(evt.denied)])
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'type' || k === 'at') continue
        displayFields.push([k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
      }
      const lines = displayFields.map(([k, v]) => `${k}: ${v}`).join('\n')
      const div = document.createElement('div')
      div.className = 'le-detail'
      div.textContent = lines
      el.appendChild(div)
      el.classList.add('expanded')
    })
  })
}

const activeFacets: Record<string, Set<string>> = {}

function filterByFacets(dimension: string, value: string): void {
  if (!activeFacets[dimension]) activeFacets[dimension] = new Set()
  const set = activeFacets[dimension]
  if (set.has(value)) {
    set.delete(value)
    if (set.size === 0) delete activeFacets[dimension]
  } else {
    set.add(value)
  }
  applyFilters()
}

function applyFilters(): void {
  const entries = document.querySelectorAll('#log-entries .le')
  const searchInput = document.getElementById('log-search-input') as HTMLInputElement | null
  const search = (searchInput?.value ?? '').toLowerCase()
  let visible = 0

  entries.forEach((le) => {
    let show = true
    for (const dim in activeFacets) {
      const attr = (le as HTMLElement).dataset[dim]
      const facetSet = activeFacets[dim]
      if (!attr || !facetSet || !facetSet.has(attr)) { show = false; break }
    }
    if (show && search) {
      show = (le.textContent ?? '').toLowerCase().includes(search)
    }
    (le as HTMLElement).classList.toggle('hidden', !show)
    if (show) visible++
  })

  const countEl = document.getElementById('log-count')
  if (countEl) countEl.textContent = `${visible} events`
}
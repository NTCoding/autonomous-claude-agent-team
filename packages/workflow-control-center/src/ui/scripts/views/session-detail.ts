import { html, esc, formatDuration, formatTimestamp, formatTimeOnly, truncateId } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderTimelineBar, attachTimelineListeners, computeTimelineSegments } from '../components/timeline-bar.js'
import { renderEventStream, attachEventStreamListeners } from '../components/event-stream.js'
import { renderJournalList } from '../components/journal-list.js'
import { renderInsights, attachInsightListeners } from '../components/insight-cards.js'
import { renderSuggestions, attachSuggestionListeners } from '../components/suggestion-cards.js'
import { renderContinueTab, attachContinueListeners } from '../components/continue-tab.js'
import { api } from '../api-client.js'
import type { SessionDetailDto, EventDto, SuggestionDto } from '../api-client.js'

type TabName = 'overview' | 'events' | 'journal' | 'insights' | 'continue'

export async function renderSessionDetail(container: HTMLElement, sessionId: string): Promise<void> {
  container.innerHTML = html`<div class="loading">Loading session ${truncateId(sessionId)}...</div>`

  try {
    const session = await api.getSession(sessionId)
    let activeTab: TabName = 'overview'
    let eventsCache: Array<EventDto> | null = null
    let eventsTotal = 0
    let drillFilter: { dimension: string; value: string } | null = null

    async function renderContent(): Promise<void> {
      container.innerHTML = renderSessionPage(session, activeTab, eventsCache, eventsTotal)
      attachTabListeners(container, (tab: TabName) => {
        activeTab = tab
        drillFilter = null
        renderContent()
      })
      attachInsightListeners(container)
      attachSuggestionListeners(container)
      attachTimelineListeners()
      attachContinueListeners(container)
      attachDrillDownListeners(container, async (dim, val) => {
        activeTab = 'events'
        drillFilter = { dimension: dim, value: val }
        eventsCache = null
        await renderContent()
      })

      if (activeTab === 'events') {
        if (!eventsCache) {
          const filterParams = drillFilter?.dimension === 'outcome' && drillFilter.value === 'denied'
            ? { limit: 500, denied: true }
            : { limit: 500 }
          const { events, total } = await api.getSessionEvents(sessionId, filterParams)
          eventsCache = events
          eventsTotal = total
          ;(window as unknown as Record<string, unknown>)['__events'] = events
        }
        const eventsEl = container.querySelector('#events-tab-content')
        if (eventsEl) {
          eventsEl.innerHTML = renderEventStream(eventsCache, eventsTotal)
          attachEventStreamListeners()
        } else if (eventsCache) {
          attachEventStreamListeners()
        }
      }
    }

    await renderContent()
  } catch {
    container.innerHTML = html`<div class="loading">Session not found</div>`
  }
}

function buildGithubLink(repo: string | undefined, path: string, num: number): string {
  if (repo === undefined) return `#${num}`
  return `<a href="https://github.com/${esc(repo)}/${path}/${num}" target="_blank">#${num}</a>`
}

function missing(): string {
  return '<span style="color:#c0392b;font-weight:500">MISSING</span>'
}

function renderSessionPage(session: SessionDetailDto, activeTab: TabName, events: Array<EventDto> | null, eventsTotal: number): string {
  const totalDenials = session.permissionDenials.write + session.permissionDenials.bash +
    session.permissionDenials.pluginRead + session.permissionDenials.idle

  const headerParts: Array<string> = []

  const repoDisplay = session.repository ? esc(session.repository) : missing()
  headerParts.push(`<h1>${repoDisplay}</h1>`)
  headerParts.push(html`<span class="sep">│</span>`)
  headerParts.push(html`<span><span class="ml">Session</span> ${truncateId(session.sessionId)}</span>`)

  const isComplete = session.currentState === 'COMPLETE'
  const statusClass = isComplete ? 'status-complete' : 'status-active'
  const statusText = isComplete ? '✅ COMPLETE' : esc(session.currentState)
  headerParts.push(html`<span class="status ${statusClass}">${statusText}</span>`)
  headerParts.push(html`<span class="sep">│</span>`)

  headerParts.push(html`<span><span class="ml">Started</span> ${esc(formatTimestamp(session.firstEventAt))}</span>`)
  headerParts.push(html`<span>→</span>`)
  headerParts.push(html`<span><span class="ml">Ended</span> ${esc(formatTimeOnly(session.lastEventAt))}</span>`)
  headerParts.push(html`<span>(${formatDuration(session.durationMs)})</span>`)

  headerParts.push(html`<span class="sep">│</span>`)
  const issueDisplay = session.issueNumber !== undefined
    ? `${buildGithubLink(session.repository, 'issues', session.issueNumber)}`
    : missing()
  headerParts.push(`<span><span class="ml">Issue</span> ${issueDisplay}</span>`)

  const branchDisplay = session.featureBranch ? esc(session.featureBranch) : missing()
  headerParts.push(`<span><span class="ml">Branch</span> ${branchDisplay}</span>`)

  const prDisplay = session.prNumber !== undefined
    ? `${buildGithubLink(session.repository, 'pull', session.prNumber)}`
    : missing()
  headerParts.push(`<span><span class="ml">PR</span> ${prDisplay}</span>`)

  const hasInsightPrompts = session.insights.some((i) => typeof i.prompt === 'string' && i.prompt.length > 0)
  const hasSuggestionPrompts = (session.suggestions ?? []).some((s) => typeof s.prompt === 'string' && s.prompt.length > 0)
  const hasPrompts = hasInsightPrompts || hasSuggestionPrompts

  const tabNames: Array<{ name: TabName; label: string; count?: number }> = [
    { name: 'overview', label: 'Overview' },
    { name: 'events', label: 'Event Log', count: session.totalEvents },
    { name: 'journal', label: 'Journal', count: session.journalEntries.length },
    { name: 'insights', label: 'Insights', count: session.insights.length },
  ]
  if (hasPrompts) {
    tabNames.push({ name: 'continue', label: 'Continue in Claude Code' })
  }

  const tabBar = tabNames.map((t) => {
    const activeClass = t.name === activeTab ? ' active' : ''
    const countHtml = t.count !== undefined ? html` <span class="tc">${t.count}</span>` : ''
    return html`<button class="tab${activeClass}" data-tab="${t.name}">${t.label}${countHtml}</button>`
  }).join('')

  let tabContent = ''
  switch (activeTab) {
    case 'overview':
      tabContent = renderOverviewTab(session)
      break
    case 'events':
      tabContent = events
        ? renderEventStream(events, eventsTotal)
        : html`<div id="events-tab-content" class="loading">Loading events...</div>`
      break
    case 'journal':
      tabContent = renderJournalList(session.journalEntries)
      break
    case 'insights':
      tabContent = renderInsights(session.insights)
      break
    case 'continue':
      tabContent = renderContinueTab(session.insights, session.suggestions ?? [])
      break
  }

  return html`<div class="header" style="margin:-20px -24px 0;padding:10px 24px"><div class="header-row"><a href="#/" class="page-back">← Sessions</a><span class="sep">│</span>${headerParts.join('\n')}</div></div>` +
    html`<div class="tab-bar" style="margin:0 -24px;padding:0 24px">${tabBar}</div>` +
    html`<div style="padding:20px 0">${tabContent}</div>`
}

function renderOverviewTab(session: SessionDetailDto): string {
  const totalDenials = session.permissionDenials.write + session.permissionDenials.bash +
    session.permissionDenials.pluginRead + session.permissionDenials.idle

  const suggestions: Array<SuggestionDto> = session.suggestions ?? []

  const hasInsightsOrSuggestions = session.insights.length > 0 || suggestions.length > 0

  let analysisHtml = ''
  if (hasInsightsOrSuggestions) {
    if (session.insights.length > 0) {
      analysisHtml += html`<div class="slabel">Insights</div>` + renderInsights(session.insights)
    }
    if (suggestions.length > 0) {
      analysisHtml += html`<div class="slabel" style="margin-top:16px">Suggestions</div>` + renderSuggestions(suggestions)
    }
    analysisHtml += html`<div class="slabel" style="margin-top:16px">Session Shape</div>`
  }

  const segments = computeTimelineSegments(session.statePeriods)

  return analysisHtml +
    renderMetricCards([
      { label: 'Duration', value: formatDuration(session.durationMs) },
      { label: 'Events', value: session.totalEvents },
      { label: 'Transitions', value: session.transitionCount },
      { label: 'Hook Denials', value: totalDenials, warn: totalDenials > 0, ...(totalDenials > 0 ? { drillDown: { dimension: 'outcome', value: 'denied' } } : {}) },
      { label: 'Agents', value: session.activeAgents.length, ...(session.activeAgents.length > 0 ? { tooltip: session.activeAgents.join(', ') } : {}) },
    ]) +
    renderTimelineBar(segments)
}

function attachTabListeners(
  container: HTMLElement,
  onTabChange: (tab: TabName) => void,
): void {
  container.querySelectorAll('.tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      const tabName = (tabEl as HTMLElement).dataset['tab'] as TabName
      onTabChange(tabName)
    })
  })
}

function attachDrillDownListeners(
  container: HTMLElement,
  onDrill: (dimension: string, value: string) => Promise<void>,
): void {
  container.querySelectorAll('.metric-link').forEach((el) => {
    el.addEventListener('click', () => {
      const dim = (el as HTMLElement).dataset['drillDim']
      const val = (el as HTMLElement).dataset['drillVal']
      if (dim && val) {
        onDrill(dim, val)
      }
    })
  })
}

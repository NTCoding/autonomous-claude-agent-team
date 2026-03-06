import { html, $, formatDuration, truncateId } from '../render.js'
import { renderMetricCards } from '../components/metric-cards.js'
import { renderTimelineBar, computeTimelineSegments } from '../components/timeline-bar.js'
import { renderEventStream } from '../components/event-stream.js'
import { renderJournalList } from '../components/journal-list.js'
import { renderInsights } from '../components/insight-cards.js'
import { renderStateMachineViz } from '../components/chart.js'
import { api } from '../api-client.js'
import type { SessionDetailDto } from '../api-client.js'

type TabName = 'overview' | 'events' | 'journal' | 'insights'

export async function renderSessionDetail(container: HTMLElement, sessionId: string): Promise<void> {
  container.innerHTML = html`<div class="loading">Loading session ${truncateId(sessionId)}...</div>`

  try {
    const session = await api.getSession(sessionId)

    let activeTab: TabName = 'overview'

    function renderContent(): void {
      container.innerHTML = renderSessionHeader(session) + renderTabs(activeTab) + renderTabContent(session, activeTab, sessionId)
      attachTabListeners(container, session, sessionId, (tab: TabName) => {
        activeTab = tab
        renderContent()
      })
    }

    renderContent()
  } catch {
    container.innerHTML = html`<div class="loading">Session not found</div>`
  }
}

function renderSessionHeader(session: SessionDetailDto): string {
  return html`
    <div style="display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-lg)">
      <a href="#/" style="color:var(--color-text-dim);text-decoration:none">&larr;</a>
      <h1 class="page-title" style="margin:0">${session.sessionId}</h1>
      <span class="state-badge" data-state="${session.currentState}">${session.currentState}</span>
      <span class="status-badge ${session.status}">${session.status}</span>
    </div>
  `
}

function renderTabs(activeTab: TabName): string {
  const tabs: Array<{ name: TabName; label: string }> = [
    { name: 'overview', label: 'Overview' },
    { name: 'events', label: 'Event Stream' },
    { name: 'journal', label: 'Journal' },
    { name: 'insights', label: 'Insights' },
  ]

  return html`
    <div class="tabs">
      ${tabs.map((t) => html`<button class="tab ${t.name === activeTab ? 'active' : ''}" data-tab="${t.name}">${t.label}</button>`).join('')}
    </div>
  `
}

function renderTabContent(session: SessionDetailDto, tab: TabName, sessionId: string): string {
  switch (tab) {
    case 'overview':
      return renderOverviewTab(session)
    case 'events':
      return html`<div id="events-tab-content" class="loading">Loading events...</div>`
    case 'journal':
      return renderJournalList(session.journalEntries)
    case 'insights':
      return renderInsights(session.insights)
  }
}

function renderOverviewTab(session: SessionDetailDto): string {
  const transitions = session.statePeriods.map((p, i) => {
    const next = session.statePeriods[i + 1]
    return next ? { from: p.state, to: next.state } : null
  }).filter((t): t is { from: string; to: string } => t !== null)

  const segments = computeTimelineSegments(session.statePeriods)
  const totalDenials = session.permissionDenials.write + session.permissionDenials.bash +
    session.permissionDenials.pluginRead + session.permissionDenials.idle

  return html`
    <div class="grid grid-2">
      <div class="chart-container">
        ${renderStateMachineViz(transitions, session.currentState)}
      </div>
      <div>
        ${renderMetricCards([
          { label: 'Duration', value: formatDuration(session.durationMs) },
          { label: 'Events', value: session.totalEvents },
          { label: 'Transitions', value: session.transitionCount },
          { label: 'Denials', value: totalDenials },
        ])}
      </div>
    </div>
    <div class="section" style="margin-top:var(--space-lg)">
      <h3 class="section-title">Timeline</h3>
      ${renderTimelineBar(segments)}
    </div>
  `
}

function attachTabListeners(
  container: HTMLElement,
  session: SessionDetailDto,
  sessionId: string,
  onTabChange: (tab: TabName) => void,
): void {
  container.querySelectorAll('.tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      const tabName = (tabEl as HTMLElement).dataset['tab'] as TabName
      onTabChange(tabName)
    })
  })

  const eventsContent = container.querySelector('#events-tab-content')
  if (eventsContent) {
    loadEvents(eventsContent as HTMLElement, sessionId)
  }
}

async function loadEvents(container: HTMLElement, sessionId: string): Promise<void> {
  try {
    const { events, total } = await api.getSessionEvents(sessionId, { limit: 100 })
    container.innerHTML = renderEventStream(events, total)
  } catch {
    container.innerHTML = html`<div class="loading">Error loading events</div>`
  }
}

import type { ReportData } from './report-assembly.js'
import { categorizeEvent, extractStructuredFields, extractOutcome } from './event-display.js'
import type { AnnotatedEvent } from './event-display.js'
import { REPORT_CSS, REPORT_JS } from './report-html-assets.js'

function escapeForScript(json: string): string {
  return json.replace(/<\//g, '<\\/')
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STATE_CSS_MAP: Record<string, string> = {
  SPAWN: 's-spawn', PLANNING: 's-plan', RESPAWN: 's-respawn',
  DEVELOPING: 's-dev', REVIEWING: 's-review', COMMITTING: 's-commit',
  CR_REVIEW: 's-cr', PR_CREATION: 's-pr', COMPLETE: 's-done',
}

const STATE_ABBREV_MAP: Record<string, string> = {
  SPAWN: 'SPAWN', PLANNING: 'PLAN', RESPAWN: 'RESP',
  DEVELOPING: 'DEV', REVIEWING: 'REV', COMMITTING: 'COM',
  CR_REVIEW: 'CR', PR_CREATION: 'PR', COMPLETE: 'DONE',
}

function stateBadge(state: string): string {
  const css = STATE_CSS_MAP[state] ?? 's-plan'
  const abbr = STATE_ABBREV_MAP[state] ?? state.slice(0, 4)
  return `<span class="ev-badge ${css}">${esc(abbr)}</span>`
}

function renderFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `<span class="ev-f"><span class="ev-fk">${esc(k)}</span> <span class="ev-fv">${esc(String(v))}</span></span>`)
    .join(' ')
}

function renderLogEntry(a: AnnotatedEvent): string {
  const outcome = extractOutcome(a.event)
  const category = categorizeEvent(a.event)
  const fields = extractStructuredFields(a.event)
  const time = a.event.at.slice(11, 19)
  const iterLabel = a.iteration === 0 ? '0' : String(a.iteration)
  const rowClasses = [
    'le',
    outcome === 'denied' ? 'denied' : '',
    category === 'journal' ? 'journal' : '',
  ].filter(Boolean).join(' ')

  const outcomeHtml = outcome
    ? `<span class="le-outcome ${outcome}">${outcome.toUpperCase()}</span>`
    : ''
  const fieldsHtml = Object.keys(fields).length > 0
    ? `<span class="le-fields">${renderFields(fields)}</span>`
    : ''
  const journalContent = a.event.type === 'journal-entry' ? a.event.content : undefined
  const contentHtml = journalContent === undefined
    ? ''
    : `<div class="le-content">"${esc(journalContent)}"</div>`

  return `<div class="${rowClasses}" data-cat="${category}" data-state="${esc(a.state)}" data-iter="${iterLabel}" data-outcome="${outcome ?? ''}">`
    + `<span class="le-time">${time}</span>`
    + stateBadge(a.state)
    + `<span class="le-name">${esc(a.event.type)}</span>`
    + outcomeHtml + fieldsHtml + contentHtml
    + `</div>`
}

export function generateReportHtml(reportData: ReportData): string {
  const dataJson = escapeForScript(JSON.stringify(reportData))
  const s = reportData.summary
  const v = reportData.viewData

  const headerMeta = buildHeaderMeta(s, v)
  const logEntries = reportData.annotatedEvents.map(renderLogEntry).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Session Report — ${esc(s.sessionId)}</title>
<style>
${REPORT_CSS}
</style>
</head>
<body>
<div class="header"><div class="header-row">${headerMeta}</div></div>
<div class="tab-bar">
<div class="tab active" onclick="switchTab('overview')">Overview</div>
<div class="tab" onclick="switchTab('iterations')">Iterations <span class="tc">${s.iterationCount}</span></div>
<div class="tab" onclick="switchTab('log')">Event Log <span class="tc">${s.eventCount}</span></div>
<div class="tab" onclick="switchTab('journal')">Journal <span class="tc">${reportData.journalEntries.length}</span></div>
<div class="tab" onclick="switchTab('continue')">Continue in Claude Code</div>
</div>
<div class="tab-content">
<div class="tab-pane active" id="tab-overview">${renderOverviewTab(reportData)}</div>
<div class="tab-pane" id="tab-iterations">${renderIterationsTab(reportData)}</div>
<div class="tab-pane" id="tab-log">${renderLogTab(reportData, logEntries)}</div>
<div class="tab-pane" id="tab-journal">${renderJournalTab(reportData)}</div>
<div class="tab-pane" id="tab-continue">${renderContinueTab(reportData)}</div>
</div>
<script>
var REPORT_DATA=${dataJson};
${REPORT_JS}
</script>
</body>
</html>`
}

function buildHeaderMeta(s: ReportData['summary'], v: ReportData['viewData']): string {
  const isComplete = s.stateDurations['COMPLETE'] !== undefined
  const statusClass = isComplete ? 'status-complete' : ''
  const statusText = isComplete ? '✅ COMPLETE' : esc(v.currentState)
  const parts = [
    `<h1>${esc(s.sessionId)}</h1>`,
    `<span class="status ${statusClass}">${statusText}</span>`,
    `<span class="sep">│</span>`,
    `<span><span class="ml">Duration</span> ${esc(s.duration)}</span>`,
  ]
  if (s.githubIssue !== undefined) parts.push(`<span><span class="ml">Issue</span> #${s.githubIssue}</span>`)
  if (s.featureBranch !== undefined) parts.push(`<span><span class="ml">Branch</span> ${esc(s.featureBranch)}</span>`)
  if (s.prNumber !== undefined) parts.push(`<span><span class="ml">PR</span> #${s.prNumber}</span>`)
  if (s.transcriptPath !== undefined) parts.push(`<span><span class="ml">Transcript</span> ${esc(s.transcriptPath)}</span>`)
  return parts.join('\n')
}

function renderInsight(i: ReportData['insights'][number]): string {
  const promptHtml = i.prompt
    ? `<div class="insight-prompt"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(i.prompt)}</div>`
    : ''
  return `<div class="insight ${i.severity}">
<div class="insight-head" onclick="toggleBody(this)"><span class="insight-title">${esc(i.title)}</span><span class="insight-arrow">▶</span></div>
<div class="insight-body"><div class="insight-evidence">${esc(i.evidence)}</div>${promptHtml}</div></div>`
}

function renderSuggestion(sg: ReportData['suggestions'][number]): string {
  return `<div class="suggestion">
<div class="suggestion-head" onclick="toggleSuggestion(this)"><span class="suggestion-title">${esc(sg.title)}</span><span class="suggestion-arrow">▶</span></div>
<div class="suggestion-body">
<div class="suggestion-rationale">${esc(sg.rationale)}</div>
<div class="suggestion-change"><strong>Change:</strong> ${esc(sg.change)}</div>
<div class="suggestion-tradeoff">${esc(sg.tradeoff)}</div>
<div class="insight-prompt"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(sg.prompt)}</div>
</div></div>`
}

function renderTimelineBar(v: ReportData['viewData']): string {
  const segments = v.statePeriods.map((p) => {
    const css = STATE_CSS_MAP[p.state] ?? 's-plan'
    const flex = Math.max(p.proportionOfTotal * 100, 0.5)
    return `<div class="tl-seg ${css}" style="flex:${flex}" title="${esc(p.state)}"></div>`
  }).join('')
  const legendItems = [...new Set(v.statePeriods.map((p) => p.state))].map((state) => {
    const css = STATE_CSS_MAP[state] ?? 's-plan'
    return `<span><i class="${css}"></i>${esc(state)}</span>`
  }).join('')
  return `<div class="timeline-bar">${segments}</div><div class="tl-legend">${legendItems}</div>`
}

function renderMetrics(s: ReportData['summary']): string {
  const rejWarn = s.reworkAnalysis.totalRejections > 0 ? ' warn' : ''
  const denWarn = s.totalDenials > 0 ? ' warn' : ''
  return `<div class="metrics">
<div class="metric"><div class="metric-val">${esc(s.duration)}</div><div class="metric-label">Duration</div></div>
<div class="metric"><div class="metric-val">${s.iterationCount}</div><div class="metric-label">Iterations</div></div>
<div class="metric${rejWarn}"><div class="metric-val">${s.reworkAnalysis.totalRejections}</div><div class="metric-label">Review Rejections</div></div>
<div class="metric${denWarn}"><div class="metric-val">${s.totalDenials}</div><div class="metric-label">Hook Denials</div></div>
<div class="metric"><div class="metric-val">${Math.round(s.reworkAnalysis.firstPassApprovalRate * 100)}%</div><div class="metric-label">First-Pass Approval</div></div>
<div class="metric"><div class="metric-val">${s.blockedEpisodes}</div><div class="metric-label">Blocked Episodes</div></div>
</div>`
}

function renderOverviewTab(data: ReportData): string {
  const insights = data.insights.map(renderInsight).join('\n')
  const suggestions = data.suggestions.map(renderSuggestion).join('\n')
  return `<div class="slabel">Insights</div>${insights}`
    + `<div class="slabel" style="margin-top:16px">Suggestions</div>${suggestions}`
    + `<div class="slabel" style="margin-top:16px">Session Shape</div>`
    + renderMetrics(data.summary)
    + renderTimelineBar(data.viewData)
}

function renderIterationCard(m: ReportData['summary']['iterationMetrics'][number], events: readonly AnnotatedEvent[]): string {
  const isFlagged = m.rejectionCount > 0
  const badges = m.firstPassApproval
    ? '<span class="badge badge-ok">✓ first-pass</span>'
    : `<span class="badge badge-bad">${m.rejectionCount} rejection${m.rejectionCount === 1 ? '' : 's'}</span>`
  const iterEvents = events
    .filter((a) => a.iteration === m.iterationIndex)
    .map((a) => {
      const time = a.event.at.slice(11, 19)
      const outcome = extractOutcome(a.event)
      const fields = extractStructuredFields(a.event)
      const outcomeHtml = outcome ? `<span class="ev-outcome ${outcome}">${outcome.toUpperCase()}</span>` : ''
      const fieldsHtml = Object.keys(fields).length > 0 ? `<span class="ev-fields">${renderFields(fields)}</span>` : ''
      return `<div class="ev"><span class="ev-time">${time}</span>${stateBadge(a.state)}<span class="ev-name">${esc(a.event.type)}</span>${outcomeHtml}${fieldsHtml}</div>`
    }).join('\n')
  return `<div class="iter${isFlagged ? ' flagged' : ''}">
<div class="iter-head" onclick="toggleIter(this)"><span class="iter-title">Iteration ${m.iterationIndex}: ${esc(m.task)}</span>
<div class="iter-badges">${badges} <span class="arrow">▶</span></div></div>
<div class="iter-body">${iterEvents}</div></div>`
}

function renderIterationsTab(data: ReportData): string {
  return data.summary.iterationMetrics
    .map((m) => renderIterationCard(m, data.annotatedEvents))
    .join('\n')
}

type FacetCounts = {
  cat: Record<string, number>
  state: Record<string, number>
  iter: Record<string, number>
  outcome: Record<string, number>
}

function buildFacetCounts(events: readonly AnnotatedEvent[]): FacetCounts {
  const cat: Record<string, number> = {}
  const state: Record<string, number> = {}
  const iter: Record<string, number> = {}
  const outcome: Record<string, number> = {}
  for (const a of events) {
    const c = categorizeEvent(a.event)
    cat[c] = (cat[c] ?? 0) + 1
    state[a.state] = (state[a.state] ?? 0) + 1
    const iterLabel = a.iteration === 0 ? '0' : String(a.iteration)
    iter[iterLabel] = (iter[iterLabel] ?? 0) + 1
    const o = extractOutcome(a.event) ?? 'none'
    outcome[o] = (outcome[o] ?? 0) + 1
  }
  return { cat, state, iter, outcome }
}

function renderFacetGroup(title: string, dimension: string, counts: Record<string, number>, total: number): string {
  const items = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([value, count]) => {
      const pct = (count / total) * 100
      return `<div class="facet-item" onclick="toggleFacet(this,'${dimension}','${esc(value)}')">`
        + `<span>${esc(value)}</span>`
        + `<div class="facet-bar"><div class="facet-bar-fill" style="width:${pct}%"></div></div>`
        + `<span class="facet-ct">${count}</span></div>`
    }).join('')
  return `<div class="facet-group"><div class="facet-title">${esc(title)}</div>${items}</div>`
}

function renderLogTab(data: ReportData, logEntries: string): string {
  const facets = buildFacetCounts(data.annotatedEvents)
  const total = data.annotatedEvents.length
  const sidebar = renderFacetGroup('Category', 'cat', facets.cat, total)
    + renderFacetGroup('State', 'state', facets.state, total)
    + renderFacetGroup('Iteration', 'iter', facets.iter, total)
    + renderFacetGroup('Outcome', 'outcome', facets.outcome, total)
  return `<div class="log-explorer">
<div class="log-search"><input type="text" placeholder="Search events..." oninput="searchLog(this.value)"><span class="result-count" id="log-count">${total} events</span></div>
<div class="log-facets">${sidebar}</div>
<div class="log-entries" id="log-entries">${logEntries}</div></div>`
}

function renderJournalTab(data: ReportData): string {
  const entries = data.journalEntries.map((j) => {
    const agentColor = j.agentName === 'developer' ? '#3498db' : '#e67e22'
    return `<div class="journal-entry" style="border-left-color:${agentColor}">
<div class="journal-meta"><span class="journal-agent">${esc(j.agentName)}</span><span>${j.at.slice(11, 19)}</span><span>${esc(j.context)}</span></div>
<div class="journal-text">"${esc(j.content)}"</div></div>`
  }).join('\n')
  const transcriptSection = data.summary.transcriptPath
    ? `<div style="margin-top:16px;padding:12px;background:white;border:1px solid #ddd;border-radius:2px">
<div style="font-size:13px;font-weight:500;margin-bottom:6px">Full session transcript</div>
<div style="margin-top:8px;font-family:monospace;font-size:12px;background:#f8f8f8;padding:8px;border-radius:3px">${esc(data.summary.transcriptPath)}</div></div>`
    : ''
  return entries + transcriptSection
}

function hasPrompt(i: ReportData['insights'][number]): i is ReportData['insights'][number] & { prompt: string } {
  return i.prompt !== undefined
}

function renderContinueTab(data: ReportData): string {
  const prompts = [
    ...data.insights.filter(hasPrompt).map((i) => ({ q: i.title, cmd: i.prompt })),
    ...data.suggestions.map((sg) => ({ q: sg.title, cmd: sg.prompt })),
  ]
  if (prompts.length === 0) return '<p style="font-size:13px;color:#666">No prompts available for this session.</p>'
  const blocks = prompts.map((p) =>
    `<div class="prompt-block"><div class="prompt-q">${esc(p.q)}</div>` +
    `<div class="prompt-cmd"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(p.cmd)}</div></div>`,
  ).join('\n')
  return `<p style="font-size:13px;color:#666;margin-bottom:16px">Copy a prompt into Claude Code to continue analysis.</p><div class="prompts">${blocks}</div>`
}


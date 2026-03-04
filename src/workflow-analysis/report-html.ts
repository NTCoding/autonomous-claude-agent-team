import type { ReportData } from './report-assembly.js'
import { categorizeEvent, extractStructuredFields, extractOutcome } from './event-display.js'
import type { AnnotatedEvent } from './event-display.js'
import { REPORT_CSS, REPORT_JS } from './report-html-assets.js'
import { formatDuration } from './workflow-analytics.js'
import { parseAnalysis } from './parse-analysis.js'
import type { ParsedAnalysis, ParsedInsight, ParsedSuggestion } from './parse-analysis.js'

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

function renderLogEntry(a: AnnotatedEvent, index: number): string {
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

  return `<div class="${rowClasses}" data-idx="${index}" data-cat="${category}" data-state="${esc(a.state)}" data-iter="${iterLabel}" data-outcome="${outcome ?? 'none'}" onclick="toggleEvent(this)">`
    + `<span class="le-time">${time}</span>`
    + stateBadge(a.state)
    + `<span class="le-name">${esc(a.event.type)}</span>`
    + outcomeHtml + fieldsHtml + contentHtml
    + `</div>`
}

function renderInsightCard(insight: ParsedInsight): string {
  const promptHtml = insight.prompt
    ? `<div class="insight-prompt"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(insight.prompt)}</div>`
    : ''
  return `<div class="insight ${insight.severity}">`
    + `<div class="insight-head" onclick="toggleBody(this)"><span class="insight-title">${esc(insight.title)}</span><span class="insight-arrow">▶</span></div>`
    + `<div class="insight-body"><div class="insight-evidence">${esc(insight.evidence)}</div>${promptHtml}</div></div>`
}

function renderSuggestionCard(suggestion: ParsedSuggestion): string {
  const changeHtml = suggestion.change
    ? `<div class="suggestion-change"><strong>Change:</strong> ${esc(suggestion.change)}</div>`
    : ''
  const tradeoffHtml = suggestion.tradeoff
    ? `<div class="suggestion-tradeoff">⚖ Trade-off: ${esc(suggestion.tradeoff)}</div>`
    : ''
  const promptHtml = suggestion.prompt
    ? `<div class="insight-prompt"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(suggestion.prompt)}</div>`
    : ''
  return `<div class="suggestion">`
    + `<div class="suggestion-head" onclick="toggleSuggestion(this)"><span class="suggestion-title">${esc(suggestion.title)}</span><span class="suggestion-arrow">▶</span></div>`
    + `<div class="suggestion-body"><div class="suggestion-rationale">${esc(suggestion.rationale)}</div>${changeHtml}${tradeoffHtml}${promptHtml}</div></div>`
}

function renderContinueTab(parsed: ParsedAnalysis): string | undefined {
  const allPrompts = [
    ...parsed.insights.filter((i) => i.prompt).map((i) => ({ q: i.title, cmd: i.prompt })),
    ...parsed.suggestions.filter((s) => s.prompt).map((s) => ({ q: s.title, cmd: s.prompt })),
  ]
  if (allPrompts.length === 0) return undefined
  const blocks = allPrompts.map((p) =>
    `<div class="prompt-block"><div class="prompt-q">${esc(p.q)}</div>`
    + `<div class="prompt-cmd"><button class="copy-btn" onclick="copyCmd(this)">Continue with Claude</button>${esc(p.cmd)}</div></div>`,
  ).join('\n')
  return `<p style="font-size:13px;color:#666;margin-bottom:16px">Copy a prompt into Claude Code to continue analysis.</p>\n<div class="prompts">${blocks}</div>`
}

export function generateReportHtml(reportData: ReportData, analysis?: string): string {
  const dataJson = escapeForScript(JSON.stringify(reportData))
  const s = reportData.summary
  const v = reportData.viewData
  const parsed = analysis === undefined ? undefined : parseAnalysis(analysis)

  const continueContent = parsed === undefined ? undefined : renderContinueTab(parsed)
  const continueTabHeader = continueContent === undefined
    ? ''
    : `\n<div class="tab" onclick="switchTab('continue')">Continue in Claude Code</div>`
  const continueTabPane = continueContent === undefined
    ? ''
    : `\n<div class="tab-pane" id="tab-continue">${continueContent}</div>`

  const headerMeta = buildHeaderMeta(s, v)
  const logEntries = reportData.annotatedEvents.map((a, i) => renderLogEntry(a, i)).join('\n')

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
<div class="tab" onclick="switchTab('journal')">Journal <span class="tc">${reportData.journalEntries.length}</span></div>${continueTabHeader}
</div>
<div class="tab-content">
<div class="tab-pane active" id="tab-overview">${renderOverviewTab(reportData, parsed)}</div>
<div class="tab-pane" id="tab-iterations">${renderIterationsTab(reportData)}</div>
<div class="tab-pane" id="tab-log">${renderLogTab(reportData, logEntries)}</div>
<div class="tab-pane" id="tab-journal">${renderJournalTab(reportData)}</div>${continueTabPane}
</div>
<script>
var REPORT_DATA=${dataJson};
${REPORT_JS}
</script>
</body>
</html>`
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getUTCMonth()]
  const day = d.getUTCDate()
  const hours24 = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  const ampm = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutePart = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `${month} ${day}, ${hours12}${minutePart} ${ampm}`
}

function formatTimeOnly(isoString: string): string {
  const d = new Date(isoString)
  const hours24 = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  const ampm = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutePart = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `${hours12}${minutePart} ${ampm}`
}

function buildGithubLink(repo: string | undefined, path: string, num: number): string {
  if (repo === undefined) return `#${num}`
  return `<a href="https://github.com/${esc(repo)}/${path}/${num}" target="_blank">#${num}</a>`
}

function buildGitParts(s: ReportData['summary']): readonly string[] {
  const gitParts: string[] = []
  if (s.githubIssue !== undefined) {
    gitParts.push(`<span><span class="ml">Issue</span> ${buildGithubLink(s.repository, 'issues', s.githubIssue)}</span>`)
  }
  if (s.featureBranch !== undefined) gitParts.push(`<span><span class="ml">Branch</span> ${esc(s.featureBranch)}</span>`)
  if (s.prNumber !== undefined) {
    gitParts.push(`<span><span class="ml">PR</span> ${buildGithubLink(s.repository, 'pull', s.prNumber)}</span>`)
  }
  return gitParts
}

function buildHeaderMeta(s: ReportData['summary'], v: ReportData['viewData']): string {
  const isComplete = s.stateDurations['COMPLETE'] !== undefined
  const statusClass = isComplete ? 'status-complete' : ''
  const statusText = isComplete ? '✅ COMPLETE' : esc(v.currentState)

  const repo = s.repository
  const parts = [
    repo === undefined ? `<h1>${esc(s.sessionId)}</h1>` : `<h1>${esc(repo)}</h1>`,
    `<span class="status ${statusClass}">${statusText}</span>`,
    `<span class="sep">│</span>`,
  ]
  if (repo !== undefined) {
    parts.push(`<span><span class="ml">Session</span> ${esc(s.sessionId)}</span>`)
    parts.push(`<span class="sep">│</span>`)
  }
  parts.push(`<span><span class="ml">Started</span> ${esc(formatTimestamp(v.startedAt))}</span>`)
  parts.push(`<span>→</span>`)
  const endedAt = v.endedAt ?? v.startedAt
  parts.push(`<span><span class="ml">Ended</span> ${esc(formatTimeOnly(endedAt))}</span>`)
  parts.push(`<span>(${esc(s.duration)})</span>`)

  const gitParts = buildGitParts(s)
  if (gitParts.length > 0) {
    parts.push(`<span class="sep">│</span>`)
    parts.push(...gitParts)
  }

  if (s.transcriptPath !== undefined) {
    parts.push(`<span class="sep">│</span>`)
    parts.push(`<span><span class="ml">Transcript</span> <code>${esc(s.transcriptPath)}</code></span>`)
  }

  return parts.join('\n')
}

function renderTimelineBar(v: ReportData['viewData']): string {
  const segments = v.statePeriods.map((p) => {
    const css = STATE_CSS_MAP[p.state] ?? 's-plan'
    const flex = Math.max(p.proportionOfTotal * 100, 0.5)
    return `<div class="tl-seg ${css}" style="flex:${flex}" title="${esc(p.state)} — ${formatDuration(p.durationMs)}"></div>`
  }).join('')
  const stateTotals = v.statePeriods.reduce<Record<string, number>>((acc, p) => ({
    ...acc,
    [p.state]: (acc[p.state] ?? 0) + p.durationMs,
  }), {})
  const legendItems = [...new Set(v.statePeriods.map((p) => p.state))].map((state) => {
    const css = STATE_CSS_MAP[state] ?? 's-plan'
    /* v8 ignore next */
    const dur = stateTotals[state] ?? 0
    return `<label class="tl-toggle"><input type="checkbox" checked onchange="toggleTimelineState('${css}')"><i class="${css}"></i>${esc(state)} <span class="tl-dur">${formatDuration(dur)}</span></label>`
  }).join('')
  return `<div class="timeline-bar">${segments}</div><div class="tl-legend">${legendItems}</div>`
}

function renderMetrics(s: ReportData['summary']): string {
  const rejWarn = s.reworkAnalysis.totalRejections > 0 ? ' warn' : ''
  const denWarn = s.totalDenials > 0 ? ' warn' : ''
  return `<div class="metrics">
<div class="metric"><div class="metric-val">${esc(s.duration)}</div><div class="metric-label">Duration</div></div>
<div class="metric"><div class="metric-val">${s.iterationCount}</div><div class="metric-label">Iterations</div></div>
<div class="metric${rejWarn} metric-link" onclick="drillDown('outcome','rejected')"><div class="metric-val">${s.reworkAnalysis.totalRejections}</div><div class="metric-label">Review Rejections</div></div>
<div class="metric${denWarn} metric-link" onclick="drillDown('outcome','denied')"><div class="metric-val">${s.totalDenials}</div><div class="metric-label">Hook Denials</div></div>
<div class="metric"><div class="metric-val">${Math.round(s.reworkAnalysis.firstPassApprovalRate * 100)}%</div><div class="metric-label">First-Pass Approval</div></div>
<div class="metric metric-link" onclick="drillDown('cat','transition')"><div class="metric-val">${s.blockedEpisodes}</div><div class="metric-label">Blocked Episodes</div></div>
</div>`
}

function renderOverviewTab(data: ReportData, parsed?: ParsedAnalysis): string {
  const parts: string[] = []
  if (parsed !== undefined && (parsed.insights.length > 0 || parsed.suggestions.length > 0)) {
    if (parsed.insights.length > 0) {
      parts.push('<div class="slabel">Insights</div>')
      parts.push(parsed.insights.map(renderInsightCard).join('\n'))
    }
    if (parsed.suggestions.length > 0) {
      parts.push('<div class="slabel" style="margin-top:16px">Suggestions</div>')
      parts.push(parsed.suggestions.map(renderSuggestionCard).join('\n'))
    }
    parts.push('<div class="slabel" style="margin-top:16px">Session Shape</div>')
  }
  parts.push(renderMetrics(data.summary))
  parts.push(renderTimelineBar(data.viewData))
  return parts.join('\n')
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
  const totalDenials = m.hookDenials.write + m.hookDenials.bash + m.hookDenials.pluginRead + m.hookDenials.idle
  const rejWarn = m.rejectionCount > 0 ? ' warn' : ''
  const denWarn = totalDenials > 0 ? ' warn' : ''
  const metricsRow = `<div class="iter-metrics">`
    + `<span>Dev ${formatDuration(m.devTimeMs)}</span>`
    + `<span>Review ${formatDuration(m.reviewTimeMs)}</span>`
    + `<span class="${rejWarn}">Rejections ${m.rejectionCount}</span>`
    + `<span class="${denWarn}">Denials ${totalDenials}</span>`
    + `</div>`
  return `<div class="iter${isFlagged ? ' flagged' : ''}">
<div class="iter-head" onclick="toggleIter(this)"><span class="iter-title">Iteration ${m.iterationIndex}: ${esc(m.task)}</span>
<div class="iter-badges">${badges} <span class="arrow">▶</span></div></div>
${metricsRow}
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
    const o = extractOutcome(a.event)
    if (o !== undefined) {
      outcome[o] = (outcome[o] ?? 0) + 1
    }
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

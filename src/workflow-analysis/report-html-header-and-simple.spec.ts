import { generateReportHtml } from './report-html.js'
import type { ReportData } from './report-assembly.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'

function buildMinimalReportData(overrides: Partial<ReportData> = {}): ReportData {
  const summary: EnhancedSessionSummary = {
    sessionId: 'test-session-123', eventCount: 5, duration: '1m 0s', iterationCount: 1,
    stateDurations: { DEVELOPING: 60000 }, reviewOutcomes: { approved: 1, rejected: 0 },
    blockedEpisodes: 0, hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    iterationMetrics: [], totalDenials: 0, velocityTrend: [],
    reworkAnalysis: { totalRejections: 0, firstPassApprovalRate: 1, reworkTimeMs: 0, reworkProportion: 0, worstIteration: undefined },
    transcriptPath: undefined, repository: undefined, githubIssue: undefined,
    featureBranch: undefined, prNumber: undefined,
  }
  const viewData: SessionViewData = {
    sessionId: 'test-session-123', startedAt: T0, endedAt: T1, currentState: 'COMPLETE',
    totalDurationMs: 60000, statePeriods: [], iterationGroups: [], recentEvents: [],
  }
  return { summary, viewData, insights: [], suggestions: [], annotatedEvents: [], journalEntries: [], ...overrides }
}

function withSummary(partial: Partial<EnhancedSessionSummary>): Partial<ReportData> {
  return { summary: { ...buildMinimalReportData().summary, ...partial } }
}

function withView(partial: Partial<SessionViewData>): Partial<ReportData> {
  return { viewData: { ...buildMinimalReportData().viewData, ...partial } }
}

describe('generateReportHtml — header mockup format', () => {
  it('shows COMPLETE status badge when stateDurations includes COMPLETE', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ stateDurations: { COMPLETE: 1000, DEVELOPING: 60000 } })))
    expect(html).toContain('status-complete')
    expect(html).toContain('✅ COMPLETE')
  })

  it('shows current state when session is not complete', () => {
    const data = buildMinimalReportData({ ...withView({ currentState: 'DEVELOPING' }), ...withSummary({ stateDurations: { DEVELOPING: 60000 } }) })
    const html = generateReportHtml(data)
    expect(html).toContain('<span class="status ">DEVELOPING</span>')
  })

  it('shows repository as h1 with session as labeled span', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ repository: 'owner/my-repo' })))
    expect(html).toContain('<h1>owner/my-repo</h1>')
    expect(html).toContain('<span class="ml">Session</span> test-session-123')
  })

  it('shows session ID as h1 when no repository', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('<h1>test-session-123</h1>')
    expect(html).not.toContain('<span class="ml">Session</span>')
  })

  it('shows Started and Ended timestamps from viewData', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('<span class="ml">Started</span>')
    expect(html).toContain('Jan 1, 12 AM')
    expect(html).toContain('<span class="ml">Ended</span>')
  })

  it('shows duration in parentheses and arrow between times', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('(1m 0s)')
    expect(html).toContain('<span>→</span>')
  })

  it('shows separators between logical groups', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ githubIssue: 42, transcriptPath: '/tmp/t.jsonl' })))
    const separatorCount = (html.match(/<span class="sep">│<\/span>/g) ?? []).length
    expect(separatorCount).toBeGreaterThanOrEqual(3)
  })

  it('omits git metadata labels when none present', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).not.toContain('<span class="ml">Issue</span>')
    expect(html).not.toContain('<span class="ml">Branch</span>')
    expect(html).not.toContain('<span class="ml">PR</span>')
  })

  it('formats timestamps with minutes when not on the hour', () => {
    const html = generateReportHtml(buildMinimalReportData(withView({ startedAt: '2026-03-03T14:14:00.000Z', endedAt: '2026-03-03T15:01:00.000Z' })))
    expect(html).toContain('Mar 3, 2:14 PM')
    expect(html).toContain('3:01 PM')
  })

  it('formats noon as 12 PM not 0 PM', () => {
    const html = generateReportHtml(buildMinimalReportData(withView({ startedAt: '2026-06-15T12:30:00.000Z' })))
    expect(html).toContain('Jun 15, 12:30 PM')
  })

  it('formats midnight endedAt as 12 AM and omits minutes', () => {
    const html = generateReportHtml(buildMinimalReportData(withView({ endedAt: '2026-01-02T00:00:00.000Z' })))
    expect(html).toContain('12 AM')
  })

  it('falls back to startedAt when endedAt is undefined', () => {
    const html = generateReportHtml(buildMinimalReportData(withView({ startedAt: '2026-03-05T09:30:00.000Z', endedAt: undefined })))
    expect(html).toContain('<span class="ml">Ended</span> 9:30 AM')
  })

  it('displays all git metadata when present', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ githubIssue: 142, featureBranch: 'feature/retry', prNumber: 89, transcriptPath: '/tmp/transcripts/abc.jsonl' })))
    expect(html).toContain('#142')
    expect(html).toContain('feature/retry')
    expect(html).toContain('#89')
  })
})

describe('generateReportHtml — without analysis', () => {
  it('does not render continue tab without analysis', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).not.toContain('tab-continue')
    expect(html).not.toContain("switchTab('continue')")
  })

  it('does not render insight cards from ReportData without analysis', () => {
    const data = buildMinimalReportData({
      insights: [{ severity: 'warning', title: '⚠ Warning', evidence: 'Ev', prompt: 'prompt' }],
      suggestions: [{ title: '💡 Suggestion', rationale: 'R', change: 'C', tradeoff: 'T', prompt: 'P' }],
    })
    const html = generateReportHtml(data)
    expect(html).not.toContain('class="insight ')
    expect(html).not.toContain('class="suggestion"')
  })

  it('overview contains metrics and timeline only without analysis', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('class="metrics"')
    expect(html).toContain('Duration')
    expect(html).not.toContain('class="slabel"')
  })

  it('always includes four base tabs', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain("switchTab('overview')")
    expect(html).toContain("switchTab('iterations')")
    expect(html).toContain("switchTab('log')")
    expect(html).toContain("switchTab('journal')")
  })
})

describe('generateReportHtml — with analysis', () => {
  const analysisWithAll = [
    '## ⚠ Too many rejections', 'Evidence of the problem.', '', 'Continue: workflow analyze abc',
    '## 💡 Fix scope', 'Rationale here.', '**Change:** Add config path', '**Trade-off:** Wider access', 'Continue: workflow fix',
  ].join('\n')

  it('renders insight cards on overview tab', () => {
    const html = generateReportHtml(buildMinimalReportData(), analysisWithAll)
    expect(html).toContain('class="insight warning"')
    expect(html).toContain('Too many rejections')
    expect(html).toContain('Evidence of the problem.')
  })

  it('renders suggestion cards on overview tab', () => {
    const html = generateReportHtml(buildMinimalReportData(), analysisWithAll)
    expect(html).toContain('class="suggestion"')
    expect(html).toContain('Fix scope')
    expect(html).toContain('Rationale here.')
  })

  it('renders section labels on overview tab', () => {
    const html = generateReportHtml(buildMinimalReportData(), analysisWithAll)
    expect(html).toContain('<div class="slabel">Insights</div>')
    expect(html).toContain('Session Shape')
  })

  it('renders continue tab with prompts', () => {
    const html = generateReportHtml(buildMinimalReportData(), analysisWithAll)
    expect(html).toContain("switchTab('continue')")
    expect(html).toContain('id="tab-continue"')
    expect(html).toContain('class="prompt-block"')
    expect(html).toContain('workflow analyze abc')
  })

  it('does not render continue tab when analysis has no prompts', () => {
    const html = generateReportHtml(buildMinimalReportData(), '## ⚠ Warning\nEvidence only')
    expect(html).not.toContain("switchTab('continue')")
    expect(html).not.toContain('id="tab-continue"')
  })

  it('omits change and tradeoff divs for simple suggestion', () => {
    const html = generateReportHtml(buildMinimalReportData(), '## 💡 Simple suggestion\nJust a rationale')
    expect(html).toContain('Simple suggestion')
    expect(html).not.toContain('<div class="suggestion-change">')
    expect(html).not.toContain('<div class="suggestion-tradeoff">')
  })

  it('omits copy button for suggestion without prompt', () => {
    const html = generateReportHtml(buildMinimalReportData(), '## 💡 Simple suggestion\nJust a rationale')
    expect(html).toContain('Just a rationale')
    expect(html).not.toContain('onclick="copyCmd(this)"')
  })

  it('escapes HTML in analysis content', () => {
    const html = generateReportHtml(buildMinimalReportData(), '## ⚠ <script>alert(1)</script>\nEvidence')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('generateReportHtml — header links', () => {
  it('renders issue number as clickable GitHub link when repo available', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ repository: 'owner/repo', githubIssue: 42 })))
    expect(html).toContain('href="https://github.com/owner/repo/issues/42"')
    expect(html).toContain('target="_blank"')
  })

  it('renders issue number as plain text when no repo', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ githubIssue: 42 })))
    expect(html).toContain('#42')
    expect(html).not.toContain('href=')
  })

  it('renders PR number as clickable GitHub link when repo available', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ repository: 'owner/repo', prNumber: 99 })))
    expect(html).toContain('href="https://github.com/owner/repo/pull/99"')
  })

  it('renders PR number as plain text when no repo', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ prNumber: 99 })))
    expect(html).toContain('#99')
    expect(html).not.toContain('github.com')
  })

  it('wraps transcript path in code tag', () => {
    const html = generateReportHtml(buildMinimalReportData(withSummary({ transcriptPath: '/tmp/t.jsonl' })))
    expect(html).toContain('<code>/tmp/t.jsonl</code>')
  })
})

describe('generateReportHtml — timeline toggles', () => {
  it('renders legend items as checkbox labels', () => {
    const data = buildMinimalReportData(withView({
      statePeriods: [{ state: 'DEVELOPING', startedAt: T0, durationMs: 60000, proportionOfTotal: 1 }],
    }))
    const html = generateReportHtml(data)
    expect(html).toContain('class="tl-toggle"')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("toggleTimelineState('s-dev')")
  })
})

describe('generateReportHtml — iteration metrics row', () => {
  const iterMetric = (partial: Record<string, unknown> = {}) => ({
    iterationIndex: 1, task: 'Task A', durationMs: 480000, devTimeMs: 300000,
    reviewTimeMs: 120000, commitTimeMs: 60000, respawnTimeMs: 0, rejectionCount: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    firstPassApproval: true, reworkCycles: 0, proportionOfSession: 1, ...partial,
  })

  it('renders dev time and review time in metrics row', () => {
    const html = generateReportHtml(buildMinimalReportData({ ...withSummary({ iterationMetrics: [iterMetric()] }), annotatedEvents: [] }))
    expect(html).toContain('class="iter-metrics"')
    expect(html).toContain('Dev 5m 0s')
    expect(html).toContain('Review 2m 0s')
  })

  it('applies warn class to rejections when non-zero', () => {
    const html = generateReportHtml(buildMinimalReportData({
      ...withSummary({ iterationMetrics: [iterMetric({ rejectionCount: 2, firstPassApproval: false, reworkCycles: 2 })] }),
      annotatedEvents: [],
    }))
    expect(html).toContain('class=" warn">Rejections 2')
  })

  it('applies warn class to denials when non-zero', () => {
    const html = generateReportHtml(buildMinimalReportData({
      ...withSummary({ iterationMetrics: [iterMetric({ hookDenials: { write: 3, bash: 1, pluginRead: 0, idle: 0 } })] }),
      annotatedEvents: [],
    }))
    expect(html).toContain('class=" warn">Denials 4')
  })
})

describe('generateReportHtml — event log facet filtering', () => {
  it('sets data-outcome to none when event has no outcome', () => {
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: { type: 'transitioned' as const, at: T0, from: 'idle', to: 'SPAWN' }, state: 'idle', iteration: 0 }],
    })
    expect(generateReportHtml(data)).toContain('data-outcome="none"')
  })

  it('does not include none in outcome facet counts', () => {
    const data = buildMinimalReportData({
      annotatedEvents: [
        { event: { type: 'transitioned' as const, at: T0, from: 'idle', to: 'SPAWN' }, state: 'idle', iteration: 0 },
        { event: { type: 'review-approved' as const, at: T1 }, state: 'REVIEWING', iteration: 1 },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain("toggleFacet(this,'outcome','approved')")
    expect(html).not.toContain("toggleFacet(this,'outcome','none')")
  })
})

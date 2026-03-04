import { generateReportHtml } from './report-html.js'
import type { ReportData } from './report-assembly.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'

function buildMinimalReportData(overrides: Partial<ReportData> = {}): ReportData {
  const summary: EnhancedSessionSummary = {
    sessionId: 'test-session-123',
    eventCount: 5,
    duration: '1m 0s',
    iterationCount: 1,
    stateDurations: { DEVELOPING: 60000 },
    reviewOutcomes: { approved: 1, rejected: 0 },
    blockedEpisodes: 0,
    hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
    iterationMetrics: [],
    reworkAnalysis: { totalRejections: 0, firstPassApprovalRate: 1, reworkTimeMs: 0, reworkProportion: 0, worstIteration: undefined },
    totalDenials: 0,
    velocityTrend: [],
    transcriptPath: undefined,
    repository: undefined,
    githubIssue: undefined,
    featureBranch: undefined,
    prNumber: undefined,
  }

  const viewData: SessionViewData = {
    sessionId: 'test-session-123',
    startedAt: T0,
    endedAt: T1,
    currentState: 'COMPLETE',
    totalDurationMs: 60000,
    statePeriods: [],
    iterationGroups: [],
    recentEvents: [],
  }

  return {
    summary,
    viewData,
    insights: [],
    suggestions: [],
    annotatedEvents: [],
    journalEntries: [],
    ...overrides,
  }
}

describe('generateReportHtml — document structure', () => {
  it('returns valid HTML document with DOCTYPE and closing tags', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html.startsWith('<!DOCTYPE html>')).toStrictEqual(true)
    expect(html).toContain('</html>')
  })

  it('contains session ID in page title', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('<title>Session Report — test-session-123</title>')
  })

  it('contains embedded report data as REPORT_DATA variable', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('var REPORT_DATA=')
  })
})

describe('generateReportHtml — tab structure', () => {
  it.each([
    ['overview'], ['iterations'], ['log'], ['journal'],
  ] as const)('contains switchTab call for %s', (tab) => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain(`switchTab('${tab}')`)
  })

  it('does not contain continue tab when no analysis', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).not.toContain(`switchTab('continue')`)
    expect(html).not.toContain('id="tab-continue"')
  })

  it.each([
    ['tab-overview'], ['tab-iterations'], ['tab-log'], ['tab-journal'],
  ] as const)('contains tab pane container %s', (id) => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain(`id="${id}"`)
  })
})

describe('generateReportHtml — CSS classes from mockup', () => {
  it('contains insight and suggestion CSS classes', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('.insight')
    expect(html).toContain('.suggestion')
    expect(html).toContain('.log-explorer')
  })

  it('contains state color classes', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('.s-spawn')
    expect(html).toContain('.s-dev')
    expect(html).toContain('.s-review')
    expect(html).toContain('.s-commit')
  })
})

describe('generateReportHtml — JavaScript functions', () => {
  it('contains client-side rendering functions', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('function switchTab')
    expect(html).toContain('function searchLog')
    expect(html).toContain('function toggleFacet')
    expect(html).toContain('function toggleTimelineState')
  })

  it('contains insight/suggestion JS functions', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('function toggleBody')
    expect(html).toContain('function toggleSuggestion')
    expect(html).toContain('function copyCmd')
  })
})

describe('generateReportHtml — XSS safety', () => {
  it('escapes closing script tags in embedded data', () => {
    const data = buildMinimalReportData()
    const withScriptInId: ReportData = {
      ...data,
      summary: { ...data.summary, sessionId: 'test</script><script>alert(1)' },
    }
    const html = generateReportHtml(withScriptInId)
    expect(html).not.toContain('test</script><script>')
    expect(html).toContain('test<\\/')
  })
})

describe('generateReportHtml — overview tab rendering', () => {
  it('does not render insight or suggestion cards when no analysis provided', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).not.toContain('class="insight ')
    expect(html).not.toContain('class="suggestion"')
  })

  it('renders insight cards on overview when analysis is provided', () => {
    const analysis = '## ⚠ Test warning\nEvidence here\n\nContinue: analyze session'
    const html = generateReportHtml(buildMinimalReportData(), analysis)
    expect(html).toContain('class="insight warning"')
    expect(html).toContain('class="insight-title"')
    expect(html).toContain('Test warning')
    expect(html).toContain('Evidence here')
  })

  it('renders suggestion cards on overview when analysis is provided', () => {
    const analysis = '## 💡 Expand scope\nRationale text\n\n**Change:** Add src/config/\n\n**Trade-off:** Wider access\n\nContinue: fix it'
    const html = generateReportHtml(buildMinimalReportData(), analysis)
    expect(html).toContain('class="suggestion"')
    expect(html).toContain('class="suggestion-title"')
    expect(html).toContain('Expand scope')
  })

  it('renders continue tab when analysis has prompts', () => {
    const analysis = '## ⚠ Test warning\nEvidence\n\nContinue: do something'
    const html = generateReportHtml(buildMinimalReportData(), analysis)
    expect(html).toContain("switchTab('continue')")
    expect(html).toContain('id="tab-continue"')
    expect(html).toContain('class="prompt-block"')
  })

  it('does not render continue tab when no analysis', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).not.toContain("switchTab('continue')")
    expect(html).not.toContain('id="tab-continue"')
  })

  it('renders metrics with warning classes when rejections or denials present', () => {
    const data = buildMinimalReportData()
    const withRejections: ReportData = {
      ...data,
      summary: {
        ...data.summary,
        reworkAnalysis: { ...data.summary.reworkAnalysis, totalRejections: 2 },
        totalDenials: 5,
      },
    }
    const html = generateReportHtml(withRejections)
    expect(html).toContain('class="metric warn metric-link"')
  })

  it('renders timeline bar segments from state periods', () => {
    const data = buildMinimalReportData({
      viewData: {
        ...buildMinimalReportData().viewData,
        statePeriods: [
          { state: 'DEVELOPING', startedAt: T0, endedAt: T1, durationMs: 60000, proportionOfTotal: 0.8 },
          { state: 'REVIEWING', startedAt: T1, durationMs: 15000, proportionOfTotal: 0.2 },
        ],
      },
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="tl-seg s-dev"')
    expect(html).toContain('class="tl-seg s-review"')
  })

  it('renders timeline segment title with duration', () => {
    const data = buildMinimalReportData({
      viewData: {
        ...buildMinimalReportData().viewData,
        statePeriods: [
          { state: 'DEVELOPING', startedAt: T0, endedAt: T1, durationMs: 60000, proportionOfTotal: 1 },
        ],
      },
    })
    const html = generateReportHtml(data)
    expect(html).toContain('title="DEVELOPING — 1m 0s"')
  })

  it('renders aggregated durations inline in legend labels', () => {
    const data = buildMinimalReportData({
      viewData: {
        ...buildMinimalReportData().viewData,
        statePeriods: [
          { state: 'DEVELOPING', startedAt: T0, durationMs: 30000, proportionOfTotal: 0.4 },
          { state: 'REVIEWING', startedAt: T0, durationMs: 15000, proportionOfTotal: 0.2 },
          { state: 'DEVELOPING', startedAt: T0, durationMs: 30000, proportionOfTotal: 0.4 },
        ],
      },
    })
    const html = generateReportHtml(data)
    expect(html).not.toContain('class="tl-summary"')
    expect(html).toContain('DEVELOPING <span class="tl-dur">1m 0s</span>')
    expect(html).toContain('REVIEWING <span class="tl-dur">0m 15s</span>')
  })
})

describe('generateReportHtml — clickable metric tiles', () => {
  it('adds drillDown onclick to rejection metric', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain("onclick=\"drillDown('outcome','rejected')\"")
  })

  it('adds drillDown onclick to denial metric', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain("onclick=\"drillDown('outcome','denied')\"")
  })

  it('adds drillDown onclick to blocked episodes metric', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain("onclick=\"drillDown('cat','transition')\"")
  })

  it('contains drillDown function in JavaScript', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('function drillDown')
  })

  it('contains metric-link CSS class', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('.metric-link')
  })
})

describe('generateReportHtml — iterations tab', () => {
  it('renders iteration cards with task names and badges', () => {
    const data = buildMinimalReportData({
      summary: {
        ...buildMinimalReportData().summary,
        iterationMetrics: [{
          iterationIndex: 1,
          task: 'Add retry logic',
          durationMs: 480000,
          devTimeMs: 300000,
          reviewTimeMs: 120000,
          commitTimeMs: 60000,
          respawnTimeMs: 0,
          rejectionCount: 0,
          hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
          firstPassApproval: true,
          reworkCycles: 0,
          proportionOfSession: 1,
        }],
      },
      annotatedEvents: [{
        event: { type: 'iteration-task-assigned' as const, at: T0, task: 'Add retry logic' },
        state: 'RESPAWN',
        iteration: 1,
      }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('Iteration 1: Add retry logic')
    expect(html).toContain('badge-ok')
  })

  it('flags iterations with rejections', () => {
    const data = buildMinimalReportData({
      summary: {
        ...buildMinimalReportData().summary,
        iterationMetrics: [{
          iterationIndex: 2,
          task: 'Failing task',
          durationMs: 1200000,
          devTimeMs: 600000,
          reviewTimeMs: 300000,
          commitTimeMs: 0,
          respawnTimeMs: 0,
          rejectionCount: 2,
          hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
          firstPassApproval: false,
          reworkCycles: 2,
          proportionOfSession: 0.5,
        }],
      },
      annotatedEvents: [],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="iter flagged"')
    expect(html).toContain('badge-bad')
    expect(html).toContain('2 rejections')
  })
})

describe('generateReportHtml — clickable event log', () => {
  it('adds data-idx attributes to log entries with sequential indices', () => {
    const data = buildMinimalReportData({
      annotatedEvents: [
        { event: { type: 'transitioned' as const, at: T0, from: 'SPAWN', to: 'PLANNING' }, state: 'PLANNING', iteration: 0 },
        { event: { type: 'transitioned' as const, at: T1, from: 'PLANNING', to: 'DEVELOPING' }, state: 'DEVELOPING', iteration: 1 },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('data-idx="0"')
    expect(html).toContain('data-idx="1"')
  })

  it('adds onclick="toggleEvent(this)" to log entries', () => {
    const data = buildMinimalReportData({
      annotatedEvents: [
        { event: { type: 'transitioned' as const, at: T0, from: 'SPAWN', to: 'PLANNING' }, state: 'PLANNING', iteration: 0 },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('onclick="toggleEvent(this)"')
  })

  it('contains toggleEvent function in JavaScript', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('function toggleEvent')
  })

  it('contains le-detail CSS class for expanded panels', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('.le-detail')
  })

  it('contains le expanded CSS class', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('.le.expanded')
  })
})


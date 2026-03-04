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
    ['overview'], ['iterations'], ['log'], ['journal'], ['continue'],
  ] as const)('contains switchTab call for %s', (tab) => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain(`switchTab('${tab}')`)
  })

  it.each([
    ['tab-overview'], ['tab-iterations'], ['tab-log'], ['tab-journal'], ['tab-continue'],
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
    expect(html).toContain('function toggleBody')
    expect(html).toContain('function searchLog')
    expect(html).toContain('function toggleFacet')
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

describe('generateReportHtml — header metadata', () => {
  it('displays session metadata in header', () => {
    const data = buildMinimalReportData()
    const withMeta: ReportData = {
      ...data,
      summary: {
        ...data.summary,
        githubIssue: 142,
        featureBranch: 'feature/retry',
        prNumber: 89,
        transcriptPath: '/tmp/transcripts/abc.jsonl',
      },
    }
    const html = generateReportHtml(withMeta)
    expect(html).toContain('test-session-123')
    expect(html).toContain('#142')
    expect(html).toContain('feature/retry')
    expect(html).toContain('#89')
  })

  it('shows COMPLETE status when session has COMPLETE state duration', () => {
    const data = buildMinimalReportData()
    const withComplete: ReportData = {
      ...data,
      summary: { ...data.summary, stateDurations: { COMPLETE: 1000, DEVELOPING: 60000 } },
    }
    const html = generateReportHtml(withComplete)
    expect(html).toContain('status-complete')
  })

  it('shows current state when session is not complete', () => {
    const data = buildMinimalReportData()
    const inProgress: ReportData = {
      ...data,
      viewData: { ...data.viewData, currentState: 'DEVELOPING' },
      summary: { ...data.summary, stateDurations: { DEVELOPING: 60000 } },
    }
    const html = generateReportHtml(inProgress)
    expect(html).toContain('DEVELOPING')
  })
})

describe('generateReportHtml — overview tab rendering', () => {
  it('renders insight cards with severity classes', () => {
    const data = buildMinimalReportData({
      insights: [
        { severity: 'warning', title: '⚠ Test warning', evidence: 'Evidence here', prompt: 'analyze session' },
        { severity: 'success', title: '✓ Test success', evidence: 'Clean run', prompt: undefined },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="insight warning"')
    expect(html).toContain('class="insight success"')
    expect(html).toContain('⚠ Test warning')
  })

  it('renders suggestion cards with rationale and change', () => {
    const data = buildMinimalReportData({
      suggestions: [{
        title: '💡 Expand scope',
        rationale: 'Developer was blocked',
        change: 'Add src/config/',
        tradeoff: 'Wider access',
        prompt: 'analyze and fix',
      }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="suggestion"')
    expect(html).toContain('Expand scope')
    expect(html).toContain('Developer was blocked')
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
    expect(html).toContain('class="metric warn"')
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

import { generateReportHtml } from './report-html.js'
import type { ReportData } from './report-assembly.js'
import type { EnhancedSessionSummary } from './session-report.js'
import type { SessionViewData } from './session-view.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'

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

describe('generateReportHtml — event log tab', () => {
  it('renders log entries with data attributes for filtering', () => {
    const transitionEvent: WorkflowEvent = { type: 'transitioned' as const, at: T0, from: 'SPAWN', to: 'PLANNING' }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: transitionEvent, state: 'SPAWN', iteration: 0 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('data-cat="transition"')
    expect(html).toContain('data-state="SPAWN"')
    expect(html).toContain('data-iter="0"')
  })

  it('renders facet sidebar with category counts', () => {
    const data = buildMinimalReportData({
      annotatedEvents: [
        { event: { type: 'transitioned' as const, at: T0, from: 'SPAWN', to: 'PLANNING' }, state: 'SPAWN', iteration: 0 },
        { event: { type: 'session-started' as const, at: T1 }, state: 'SPAWN', iteration: 0 },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="facet-group"')
    expect(html).toContain('Category')
  })

  it('renders denied events with denied class and outcome', () => {
    const deniedEvent: WorkflowEvent = {
      type: 'write-checked' as const, at: T0, tool: 'Write', filePath: 'a.ts', allowed: false, reason: 'blocked',
    }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: deniedEvent, state: 'DEVELOPING', iteration: 1 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="le denied"')
    expect(html).toContain('le-outcome denied')
    expect(html).toContain('DENIED')
  })

  it('renders approved events with approved class', () => {
    const approvedEvent: WorkflowEvent = { type: 'review-approved' as const, at: T0 }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: approvedEvent, state: 'REVIEWING', iteration: 1 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('le-outcome approved')
    expect(html).toContain('APPROVED')
  })

  it('renders journal events with journal class and content', () => {
    const journalEvent: WorkflowEvent = {
      type: 'journal-entry' as const, at: T0, agentName: 'developer', content: 'Working on task',
    }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: journalEvent, state: 'DEVELOPING', iteration: 1 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('class="le journal"')
    expect(html).toContain('le-content')
    expect(html).toContain('Working on task')
  })

  it('renders rejected events with rejected outcome', () => {
    const rejectedEvent: WorkflowEvent = { type: 'review-rejected' as const, at: T0 }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event: rejectedEvent, state: 'REVIEWING', iteration: 1 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('le-outcome rejected')
    expect(html).toContain('REJECTED')
  })

  it('renders events with structured fields', () => {
    const event: WorkflowEvent = { type: 'iteration-task-assigned' as const, at: T0, task: 'Do stuff' }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event, state: 'RESPAWN', iteration: 1 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('le-fk')
    expect(html).toContain('task')
  })

  it('renders events with unknown state using fallback abbreviation', () => {
    const event: WorkflowEvent = { type: 'session-started' as const, at: T0 }
    const data = buildMinimalReportData({
      annotatedEvents: [{ event, state: 'BLOCKED', iteration: 0 }],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('s-plan')
    expect(html).toContain('BLOC')
  })
})

describe('generateReportHtml — journal tab', () => {
  it('renders journal entries with agent colors', () => {
    const data = buildMinimalReportData({
      journalEntries: [
        { at: T0, agentName: 'developer', content: 'Working', iterationIndex: 1, state: 'DEVELOPING', context: 'Iteration 1 · DEVELOPING' },
        { at: T1, agentName: 'reviewer', content: 'Reviewing', iterationIndex: 1, state: 'REVIEWING', context: 'Iteration 1 · REVIEWING' },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('border-left-color:#3498db')
    expect(html).toContain('border-left-color:#e67e22')
    expect(html).toContain('Working')
  })

  it('renders transcript link when available', () => {
    const data = buildMinimalReportData({
      summary: { ...buildMinimalReportData().summary, transcriptPath: '/tmp/t.jsonl' },
    })
    const html = generateReportHtml(data)
    expect(html).toContain('/tmp/t.jsonl')
    expect(html).toContain('Full session transcript')
  })
})

describe('generateReportHtml — no continue tab', () => {
  it('does not render continue tab pane when no analysis provided', () => {
    const data = buildMinimalReportData({
      insights: [{ severity: 'warning', title: 'Insight prompt', evidence: 'test', prompt: 'analyze this' }],
      suggestions: [{ title: 'Suggestion prompt', rationale: 'r', change: 'c', tradeoff: 't', prompt: 'fix this' }],
    })
    const html = generateReportHtml(data)
    expect(html).not.toContain('tab-continue')
    expect(html).not.toContain('No prompts available')
    expect(html).not.toContain("switchTab('continue')")
  })
})

describe('generateReportHtml — edge cases', () => {
  it('does not render insight cards even when insights provided', () => {
    const data = buildMinimalReportData({
      insights: [{ severity: 'success', title: '✓ Clean', evidence: 'No issues', prompt: undefined }],
    })
    const html = generateReportHtml(data)
    expect(html).not.toContain('insight success')
  })

  it('renders log tab with empty events uses fallback facet counts', () => {
    const html = generateReportHtml(buildMinimalReportData())
    expect(html).toContain('0 events')
    expect(html).toContain('log-explorer')
  })

  it('renders iteration card event with no outcome and no fields', () => {
    const data = buildMinimalReportData({
      summary: {
        ...buildMinimalReportData().summary,
        iterationMetrics: [{
          iterationIndex: 1, task: 'Task', durationMs: 60000, devTimeMs: 60000,
          reviewTimeMs: 0, commitTimeMs: 0, respawnTimeMs: 0, rejectionCount: 1,
          hookDenials: { write: 0, bash: 0, pluginRead: 0, idle: 0 },
          firstPassApproval: false, reworkCycles: 1, proportionOfSession: 1,
        }],
      },
      annotatedEvents: [
        { event: { type: 'review-approved' as const, at: T0 }, state: 'REVIEWING', iteration: 1 },
      ],
    })
    const html = generateReportHtml(data)
    expect(html).toContain('1 rejection')
  })

  it('renders timeline with unknown state using fallback class', () => {
    const data = buildMinimalReportData({
      viewData: {
        ...buildMinimalReportData().viewData,
        statePeriods: [{ state: 'CUSTOM_STATE', startedAt: T0, durationMs: 60000, proportionOfTotal: 1 }],
      },
    })
    const html = generateReportHtml(data)
    expect(html).toContain('s-plan')
  })
})

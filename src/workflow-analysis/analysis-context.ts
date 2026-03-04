import type { ReportData } from './report-assembly.js'
import type { AnnotatedEvent } from './event-display.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'
import { formatDuration } from './workflow-analytics.js'

function headerSection(data: ReportData): string {
  const s = data.summary
  const lines = [
    '# Session Analysis Context',
    '',
    `Session: ${s.sessionId}`,
    `Duration: ${s.duration}`,
    `Iterations: ${s.iterationCount}`,
    `Final state: ${data.viewData.currentState}`,
  ]
  if (s.repository !== undefined) lines.push(`Repository: ${s.repository}`)
  if (s.githubIssue !== undefined) lines.push(`Issue: #${s.githubIssue}`)
  if (s.featureBranch !== undefined) lines.push(`Branch: ${s.featureBranch}`)
  if (s.prNumber !== undefined) lines.push(`PR: #${s.prNumber}`)
  return lines.join('\n')
}

function metricsSection(data: ReportData): string {
  const s = data.summary
  const d = s.hookDenials
  const denialParts: string[] = []
  if (d.write > 0) denialParts.push(`write=${d.write}`)
  if (d.bash > 0) denialParts.push(`bash=${d.bash}`)
  if (d.pluginRead > 0) denialParts.push(`pluginRead=${d.pluginRead}`)
  if (d.idle > 0) denialParts.push(`idle=${d.idle}`)
  const denialBreakdown = denialParts.length > 0 ? ` (${denialParts.join(', ')})` : ''

  return [
    '',
    '## Metrics',
    '',
    `Review rejections: ${s.reworkAnalysis.totalRejections}`,
    `Hook denials: ${s.totalDenials}${denialBreakdown}`,
    `First-pass approval rate: ${Math.round(s.reworkAnalysis.firstPassApprovalRate * 100)}%`,
    `Rework proportion: ${Math.round(s.reworkAnalysis.reworkProportion * 100)}%`,
    `Blocked episodes: ${s.blockedEpisodes}`,
  ].join('\n')
}

function iterationTimeline(data: ReportData): string {
  const metrics = data.summary.iterationMetrics
  if (metrics.length === 0) return ''

  const rows = metrics.map((m) => {
    const parts = [
      `- Iteration ${m.iterationIndex}: "${m.task}"`,
      `  Duration: ${formatDuration(m.durationMs)}`,
      `  Dev: ${formatDuration(m.devTimeMs)}, Review: ${formatDuration(m.reviewTimeMs)}`,
      `  Rejections: ${m.rejectionCount}`,
      `  First-pass: ${m.firstPassApproval ? 'yes' : 'no'}`,
    ]
    const denials = m.hookDenials.write + m.hookDenials.bash + m.hookDenials.pluginRead + m.hookDenials.idle
    if (denials > 0) parts.push(`  Hook denials: ${denials}`)
    return parts.join('\n')
  })

  return ['', '## Iteration Timeline', '', ...rows].join('\n')
}

type TransitionAnnotated = AnnotatedEvent & { event: Extract<WorkflowEvent, { type: 'transitioned' }> }

function isTransitionAnnotated(a: AnnotatedEvent): a is TransitionAnnotated {
  return a.event.type === 'transitioned'
}

function stateTransitions(data: ReportData): string {
  const transitions = data.annotatedEvents.filter(isTransitionAnnotated)
  if (transitions.length === 0) return ''

  const rows = transitions.map((a) =>
    `- ${a.event.at.slice(11, 19)} ${a.event.from} -> ${a.event.to}`,
  )

  return ['', '## State Transitions', '', ...rows].join('\n')
}

function isDenialEvent(a: AnnotatedEvent): boolean {
  switch (a.event.type) {
    case 'write-checked':
    case 'bash-checked':
    case 'plugin-read-checked':
    case 'idle-checked':
      return !a.event.allowed
    default:
      return false
  }
}

function isRejectionEvent(a: AnnotatedEvent): boolean {
  return a.event.type === 'review-rejected'
}

function isBlockedEvent(a: AnnotatedEvent): boolean {
  if (a.event.type !== 'transitioned') return false
  return a.event.to === 'BLOCKED' || a.event.from === 'BLOCKED'
}

function formatNotableEvent(a: AnnotatedEvent): string {
  const time = a.event.at.slice(11, 19)
  const fields = Object.entries(a.event)
    .filter(([k]) => k !== 'type' && k !== 'at')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ')
  return `- ${time} [iter=${a.iteration}, state=${a.state}] ${a.event.type}: ${fields}`
}

function notableEvents(data: ReportData): string {
  const notable = data.annotatedEvents.filter(
    (a) => isDenialEvent(a) || isRejectionEvent(a) || isBlockedEvent(a),
  )
  if (notable.length === 0) return ''

  return ['', '## Notable Events', '', ...notable.map(formatNotableEvent)].join('\n')
}

function journalSection(data: ReportData): string {
  if (data.journalEntries.length === 0) return ''

  const entries = data.journalEntries.map((j) => [
    `- ${j.at.slice(11, 19)} [${j.agentName}] (${j.context})`,
    `  "${j.content}"`,
  ].join('\n'))

  return ['', '## Journal Entries', '', ...entries].join('\n')
}

function closingPrompt(): string {
  return [
    '',
    '---',
    '',
    'Analyze this session. Identify patterns, bottlenecks, and actionable improvements. Focus on what went well, what caused friction, and what the team should change for the next session.',
  ].join('\n')
}

export function formatAnalysisContext(data: ReportData): string {
  return [
    headerSection(data),
    metricsSection(data),
    iterationTimeline(data),
    stateTransitions(data),
    notableEvents(data),
    journalSection(data),
    closingPrompt(),
  ].join('\n')
}

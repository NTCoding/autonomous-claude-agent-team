import type { WorkflowEvent } from '../workflow-definition/index.js'

export type EventCategory = 'transition' | 'milestone' | 'devcycle' | 'review' | 'permission' | 'agent' | 'journal' | 'quality'

export type AnnotatedEvent = {
  event: WorkflowEvent
  state: string
  iteration: number
}

const CATEGORY_MAP: Record<WorkflowEvent['type'], EventCategory> = {
  'transitioned': 'transition',
  'session-started': 'milestone',
  'issue-recorded': 'milestone',
  'branch-recorded': 'milestone',
  'plan-approval-recorded': 'milestone',
  'pr-created': 'milestone',
  'pr-recorded': 'milestone',
  'iteration-task-assigned': 'devcycle',
  'developer-done-signaled': 'devcycle',
  'iteration-ticked': 'devcycle',
  'issue-checklist-appended': 'devcycle',
  'review-approved': 'review',
  'review-rejected': 'review',
  'coderabbit-addressed': 'review',
  'coderabbit-ignored': 'review',
  'write-checked': 'permission',
  'bash-checked': 'permission',
  'plugin-read-checked': 'permission',
  'idle-checked': 'permission',
  'agent-registered': 'agent',
  'agent-shut-down': 'agent',
  'identity-verified': 'agent',
  'context-requested': 'agent',
  'journal-entry': 'journal',
  'lint-ran': 'quality',
}

export function categorizeEvent(event: Pick<WorkflowEvent, 'type'>): EventCategory {
  return CATEGORY_MAP[event.type]
}

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

function extractTransitionFields(event: WorkflowEvent): Record<string, unknown> {
  /* v8 ignore next */
  if (event.type !== 'transitioned') return {}
  return omitUndefined({ from: event.from, to: event.to, iteration: event.iteration, preBlockedState: event.preBlockedState })
}

function extractMilestoneFields(event: WorkflowEvent): Record<string, unknown> {
  if (event.type === 'session-started') return omitUndefined({ transcriptPath: event.transcriptPath })
  if (event.type === 'issue-recorded') return { issueNumber: event.issueNumber }
  if (event.type === 'branch-recorded') return { branch: event.branch }
  if (event.type === 'pr-created') return { prNumber: event.prNumber }
  if (event.type === 'pr-recorded') return { prNumber: event.prNumber }
  /* v8 ignore next 2 */
  return {}
}

function extractDevcycleFields(event: WorkflowEvent): Record<string, unknown> {
  if (event.type === 'iteration-task-assigned') return { task: event.task }
  if (event.type === 'issue-checklist-appended' || event.type === 'iteration-ticked') return { issueNumber: event.issueNumber }
  /* v8 ignore next 2 */
  return {}
}

function extractPermissionFields(event: WorkflowEvent): Record<string, unknown> {
  if (event.type === 'write-checked') return omitUndefined({ tool: event.tool, filePath: event.filePath, allowed: event.allowed, reason: event.reason })
  if (event.type === 'bash-checked') return omitUndefined({ tool: event.tool, command: event.command, allowed: event.allowed, reason: event.reason })
  if (event.type === 'plugin-read-checked') return omitUndefined({ tool: event.tool, path: event.path, allowed: event.allowed, reason: event.reason })
  /* v8 ignore next 4 */
  if (event.type === 'idle-checked') return omitUndefined({ agentName: event.agentName, allowed: event.allowed, reason: event.reason })
  return {}
}

function extractAgentFields(event: WorkflowEvent): Record<string, unknown> {
  if (event.type === 'agent-registered') return { agentType: event.agentType, agentId: event.agentId }
  if (event.type === 'agent-shut-down') return { agentName: event.agentName }
  if (event.type === 'identity-verified') return { status: event.status, transcriptPath: event.transcriptPath }
  /* v8 ignore next 4 */
  if (event.type === 'context-requested') return { agentName: event.agentName }
  return {}
}

function extractJournalOrQualityFields(event: WorkflowEvent): Record<string, unknown> {
  if (event.type === 'journal-entry') return { agentName: event.agentName, content: event.content }
  /* v8 ignore next 4 */
  if (event.type === 'lint-ran') return { files: event.files, passed: event.passed }
  return {}
}

const CATEGORY_FIELD_EXTRACTOR: Record<EventCategory, (event: WorkflowEvent) => Record<string, unknown>> = {
  transition: extractTransitionFields,
  milestone: extractMilestoneFields,
  devcycle: extractDevcycleFields,
  permission: extractPermissionFields,
  agent: extractAgentFields,
  review: () => ({}),
  journal: extractJournalOrQualityFields,
  quality: extractJournalOrQualityFields,
}

export function extractStructuredFields(event: WorkflowEvent): Record<string, unknown> {
  return CATEGORY_FIELD_EXTRACTOR[categorizeEvent(event)](event)
}

type PermissionEvent = Extract<WorkflowEvent, { allowed: boolean }>

function isPermissionEvent(event: WorkflowEvent): event is PermissionEvent {
  return 'allowed' in event
}

export function extractOutcome(event: WorkflowEvent): string | undefined {
  if (isPermissionEvent(event) && !event.allowed) return 'denied'
  if (event.type === 'review-rejected') return 'rejected'
  if (event.type === 'review-approved') return 'approved'
  return undefined
}

export function annotateEventsWithState(events: readonly WorkflowEvent[]): readonly AnnotatedEvent[] {
  return events.reduce<{ state: string; result: readonly AnnotatedEvent[] }>(
    (acc, event) => {
      const annotated = { event, state: acc.state, iteration: 0 }
      const nextState = event.type === 'transitioned' ? event.to : acc.state
      return { state: nextState, result: [...acc.result, annotated] }
    },
    { state: 'idle', result: [] },
  ).result
}

export function annotateEvents(events: readonly WorkflowEvent[]): readonly AnnotatedEvent[] {
  return events.reduce<{ state: string; iteration: number; result: readonly AnnotatedEvent[] }>(
    (acc, event) => {
      const state = event.type === 'transitioned' ? event.to : acc.state
      const iteration = event.type === 'iteration-task-assigned' ? acc.iteration + 1 : acc.iteration
      return { state, iteration, result: [...acc.result, { event, state: acc.state, iteration }] }
    },
    { state: 'idle', iteration: 0, result: [] },
  ).result
}

export function annotateEventsWithIteration(events: readonly WorkflowEvent[]): readonly AnnotatedEvent[] {
  return events.reduce<{ iteration: number; result: readonly AnnotatedEvent[] }>(
    (acc, event) => {
      const nextIteration = event.type === 'iteration-task-assigned' ? acc.iteration + 1 : acc.iteration
      const annotated = { event, state: '', iteration: nextIteration }
      return { iteration: nextIteration, result: [...acc.result, annotated] }
    },
    { iteration: 0, result: [] },
  ).result
}

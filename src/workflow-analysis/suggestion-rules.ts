import type { EnhancedSessionSummary } from './session-report.js'
import type { WorkflowEvent } from '../workflow-definition/index.js'
import { annotateEventsWithState } from './event-display.js'

export type Suggestion = {
  title: string
  rationale: string
  change: string
  tradeoff: string
  prompt: string
}

function findCommonDirectoryPrefix(paths: readonly string[]): string | undefined {
  if (paths.length < 2) return undefined
  const segments = paths.map((p) => p.split('/').slice(0, -1))
  const shortest = segments.reduce((min, s) => (s.length < min.length ? s : min))
  const common = shortest.filter((seg, i) => segments.every((s) => s[i] === seg))
  if (common.length === 0) return undefined
  return common.join('/')
}

function expandWriteScope(summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]): Suggestion | undefined {
  if (summary.hookDenials.write < 2) return undefined
  const deniedPaths = events
    .filter((e): e is Extract<WorkflowEvent, { type: 'write-checked' }> => e.type === 'write-checked' && !e.allowed)
    .map((e) => e.filePath)
  const commonPrefix = findCommonDirectoryPrefix(deniedPaths)
  if (commonPrefix === undefined) return undefined
  return {
    title: `💡 Add ${commonPrefix} to developer write scope`,
    rationale: `Developer was denied writes to ${deniedPaths.join(', ')}. All share the common directory ${commonPrefix}.`,
    change: `In workflow-definition/hooks/write-guard.ts, add ${commonPrefix} to the developer's allowed write paths during DEVELOPING state.`,
    tradeoff: `Wider write scope means the developer could modify ${commonPrefix} files unrelated to their task. Mitigated by the reviewer catching unrelated changes.`,
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\nRead workflow-definition/hooks/write-guard.ts. The developer was denied writes to ${deniedPaths.join(', ')}. Add ${commonPrefix} to the developer's allowed write paths. Show me the specific code change and explain the security implications.`,
  }
}

function isDenialEvent(event: WorkflowEvent): boolean {
  switch (event.type) {
    case 'write-checked':
    case 'bash-checked':
    case 'plugin-read-checked':
    case 'idle-checked':
      return !event.allowed
    default:
      return false
  }
}

function hasDenialBeforeRejection(events: readonly WorkflowEvent[]): boolean {
  const annotated = annotateEventsWithState(events)
  const developingDenials = annotated
    .filter((a) => a.state === 'DEVELOPING' && isDenialEvent(a.event))
  const rejections = events.filter((e) => e.type === 'review-rejected')
  return developingDenials.some((denial) =>
    rejections.some((rej) => new Date(denial.event.at).getTime() < new Date(rej.at).getTime()),
  )
}

function detectGuardrailConflicts(_summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]): Suggestion | undefined {
  if (!hasDenialBeforeRejection(events)) return undefined
  return {
    title: '💡 Detect guardrail conflicts during planning',
    rationale: 'The task required writes/commands that guardrails blocked. Planning didn\'t surface this conflict.',
    change: 'Add a checklist item to states/planning.md: "For each iteration task, verify that required file paths fall within the developer write scope."',
    tradeoff: 'Makes planning slightly slower. Prevents rework loops caused by guardrail/task mismatches.',
    prompt: `autonomous-claude-agent-team:analyze ${_summary.sessionId}\n\nReview the planning checklist and add guardrail conflict detection.`,
  }
}

function iterationHasDenialsAndRejections(m: { rejectionCount: number; hookDenials: { write: number; bash: number; pluginRead: number; idle: number } }): boolean {
  const totalDenials = m.hookDenials.write + m.hookDenials.bash + m.hookDenials.pluginRead + m.hookDenials.idle
  return totalDenials > 0 && m.rejectionCount > 0
}

function improveIssueDescription(summary: EnhancedSessionSummary): Suggestion | undefined {
  if (summary.githubIssue === undefined) return undefined
  const problematic = summary.iterationMetrics.find(iterationHasDenialsAndRejections)
  if (problematic === undefined) return undefined
  return {
    title: `💡 Issue #${summary.githubIssue} didn't specify file requirements`,
    rationale: `Iteration ${problematic.iterationIndex} had both hook denials and review rejections, suggesting the task description was incomplete.`,
    change: 'Update the issue template or planning prompt to include: "List file paths or directories each iteration will need to modify."',
    tradeoff: 'Adds overhead to issue creation. The lead agent already reads the codebase during planning — this makes the output more explicit.',
    prompt: `autonomous-claude-agent-team:analyze ${summary.sessionId}\n\nReview issue #${summary.githubIssue} and suggest improvements to prevent guardrail conflicts.`,
  }
}

export function evaluateSuggestionRules(summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]): readonly Suggestion[] {
  return [
    expandWriteScope(summary, events),
    detectGuardrailConflicts(summary, events),
    improveIssueDescription(summary),
  ].filter((s): s is Suggestion => s !== undefined)
}

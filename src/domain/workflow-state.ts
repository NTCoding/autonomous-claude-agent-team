import { z } from 'zod'

export const StateName = z.enum([
  'SPAWN',
  'PLANNING',
  'RESPAWN',
  'DEVELOPING',
  'REVIEWING',
  'COMMITTING',
  'CR_REVIEW',
  'PR_CREATION',
  'FEEDBACK',
  'BLOCKED',
  'COMPLETE',
])

export type StateName = z.infer<typeof StateName>

export const EventLogEntry = z.object({
  op: z.string(),
  at: z.string(),
  detail: z.record(z.unknown()).optional(),
})

export type EventLogEntry = z.infer<typeof EventLogEntry>

export const WorkflowState = z.object({
  state: StateName,
  iteration: z.number().int().nonnegative(),
  githubIssue: z.number().int().positive().optional(),
  featureBranch: z.string().optional(),
  developerDone: z.boolean(),
  lintRanIteration: z.number().int(),
  developingHeadCommit: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  userApprovedPlan: z.boolean(),
  currentIterationTask: z.string().optional(),
  activeAgents: z.array(z.string()),
  lintedFiles: z.array(z.string()),
  commitsBlocked: z.boolean(),
  preBlockedState: StateName.optional(),
  eventLog: z.array(EventLogEntry),
})

export type WorkflowState = z.infer<typeof WorkflowState>

export const INITIAL_STATE: WorkflowState = {
  state: 'SPAWN',
  iteration: 0,
  developerDone: false,
  lintRanIteration: -1,
  userApprovedPlan: false,
  activeAgents: [],
  lintedFiles: [],
  commitsBlocked: false,
  eventLog: [],
}

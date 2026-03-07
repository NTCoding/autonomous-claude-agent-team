import { z } from 'zod'
import type { WorkflowStateDefinition, WorkflowRegistry } from '@ntcoding/agentic-workflow-builder/dsl'

export const STATE_NAMES = [
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
] as const

export type StateName = (typeof STATE_NAMES)[number]

export const StateNameSchema = z.enum(STATE_NAMES)

const IterationStateSchema = z.object({
  task: z.string(),
  developerDone: z.boolean(),
  developingHeadCommit: z.string().optional(),
  reviewApproved: z.boolean(),
  reviewRejected: z.boolean(),
  coderabbitFeedbackAddressed: z.boolean(),
  coderabbitFeedbackIgnored: z.boolean(),
  lintedFiles: z.array(z.string()),
  lintRanIteration: z.boolean(),
})

export type IterationState = z.infer<typeof IterationStateSchema>

export function createWorkflowStateSchema<T extends readonly [string, ...string[]]>(stateNames: T) {
  const stateNameSchema = z.enum(stateNames)
  return z.object({
    currentStateMachineState: stateNameSchema,
    iteration: z.number().int().nonnegative(),
    iterations: z.array(IterationStateSchema),
    githubIssue: z.number().int().positive().optional(),
    featureBranch: z.string().optional(),
    prNumber: z.number().int().positive().optional(),
    userApprovedPlan: z.boolean(),
    activeAgents: z.array(z.string()),
    transcriptPath: z.string().optional(),
    preBlockedState: stateNameSchema.optional(),
  })
}

export const WorkflowStateSchema = createWorkflowStateSchema(STATE_NAMES)

export type WorkflowState = {
  currentStateMachineState: StateName
  iteration: number
  iterations: IterationState[]
  githubIssue?: number | undefined
  featureBranch?: string | undefined
  prNumber?: number | undefined
  userApprovedPlan: boolean
  activeAgents: string[]
  transcriptPath?: string | undefined
  preBlockedState?: StateName | undefined
}

export type WorkflowOperation =
  | 'record-issue'
  | 'record-branch'
  | 'record-plan-approval'
  | 'assign-iteration-task'
  | 'signal-done'
  | 'record-pr'
  | 'create-pr'
  | 'append-issue-checklist'
  | 'tick-iteration'
  | 'review-approved'
  | 'review-rejected'
  | 'coderabbit-feedback-addressed'
  | 'coderabbit-feedback-ignored'
  | 'get-session-summary'

export type ConcreteStateDefinition = WorkflowStateDefinition<WorkflowState, StateName, WorkflowOperation>

export type ConcreteRegistry = WorkflowRegistry<WorkflowState, StateName, WorkflowOperation>

export const INITIAL_STATE: WorkflowState = {
  currentStateMachineState: 'SPAWN',
  iteration: 0,
  iterations: [],
  userApprovedPlan: false,
  activeAgents: [],
}

export function parseStateName(value: string): StateName {
  return StateNameSchema.parse(value)
}



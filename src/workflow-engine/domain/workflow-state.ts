import { z } from 'zod'

export class WorkflowStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowStateError'
  }
}

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

export function createWorkflowStateSchema(stateNames: readonly [string, ...string[]]) {
  const stateNameSchema = z.enum(stateNames)
  return z.object({
    state: stateNameSchema,
    iteration: z.number().int().nonnegative(),
    iterations: z.array(IterationStateSchema),
    githubIssue: z.number().int().positive().optional(),
    featureBranch: z.string().optional(),
    prNumber: z.number().int().positive().optional(),
    userApprovedPlan: z.boolean(),
    activeAgents: z.array(z.string()),
    transcriptPath: z.string().optional(),
    preBlockedState: z.string().optional(),
  })
}

export type WorkflowState = {
  state: string
  iteration: number
  iterations: IterationState[]
  githubIssue?: number | undefined
  featureBranch?: string | undefined
  prNumber?: number | undefined
  userApprovedPlan: boolean
  activeAgents: string[]
  transcriptPath?: string | undefined
  preBlockedState?: string | undefined
}

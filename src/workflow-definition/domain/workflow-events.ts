import { z } from 'zod'

const SessionStartedSchema = z.object({
  type: z.literal('session-started'),
  at: z.string(),
  sessionId: z.string(),
  transcriptPath: z.string().optional(),
})

const IssueRecordedSchema = z.object({
  type: z.literal('issue-recorded'),
  at: z.string(),
  issueNumber: z.number(),
})

const BranchRecordedSchema = z.object({
  type: z.literal('branch-recorded'),
  at: z.string(),
  branch: z.string(),
})

const PlanApprovalRecordedSchema = z.object({
  type: z.literal('plan-approval-recorded'),
  at: z.string(),
})

const IterationTaskAssignedSchema = z.object({
  type: z.literal('iteration-task-assigned'),
  at: z.string(),
  task: z.string(),
})

const DeveloperDoneSignaledSchema = z.object({
  type: z.literal('developer-done-signaled'),
  at: z.string(),
})

const PrRecordedSchema = z.object({
  type: z.literal('pr-recorded'),
  at: z.string(),
  prNumber: z.number(),
})

const PrCreatedSchema = z.object({
  type: z.literal('pr-created'),
  at: z.string(),
  prNumber: z.number(),
})

const IssueChecklistAppendedSchema = z.object({
  type: z.literal('issue-checklist-appended'),
  at: z.string(),
  issueNumber: z.number(),
})

const IterationTickedSchema = z.object({
  type: z.literal('iteration-ticked'),
  at: z.string(),
  issueNumber: z.number(),
})

const ReviewApprovedSchema = z.object({
  type: z.literal('review-approved'),
  at: z.string(),
})

const ReviewRejectedSchema = z.object({
  type: z.literal('review-rejected'),
  at: z.string(),
})

const CoderabbitAddressedSchema = z.object({
  type: z.literal('coderabbit-addressed'),
  at: z.string(),
})

const CoderabbitIgnoredSchema = z.object({
  type: z.literal('coderabbit-ignored'),
  at: z.string(),
})

const LintRanSchema = z.object({
  type: z.literal('lint-ran'),
  at: z.string(),
  files: z.number(),
  passed: z.boolean(),
  lintedFiles: z.array(z.string()).optional(),
})

const AgentRegisteredSchema = z.object({
  type: z.literal('agent-registered'),
  at: z.string(),
  agentType: z.string(),
  agentId: z.string(),
})

const AgentShutDownSchema = z.object({
  type: z.literal('agent-shut-down'),
  at: z.string(),
  agentName: z.string(),
})

const TransitionedSchema = z.object({
  type: z.literal('transitioned'),
  at: z.string(),
  from: z.string(),
  to: z.string(),
  preBlockedState: z.string().optional(),
  iteration: z.number().optional(),
  developingHeadCommit: z.string().optional(),
  developerDone: z.boolean().optional(),
})

const IdleCheckedSchema = z.object({
  type: z.literal('idle-checked'),
  at: z.string(),
  agentName: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
})

const WriteCheckedSchema = z.object({
  type: z.literal('write-checked'),
  at: z.string(),
  tool: z.string(),
  filePath: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
})

const BashCheckedSchema = z.object({
  type: z.literal('bash-checked'),
  at: z.string(),
  tool: z.string(),
  command: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
})

const PluginReadCheckedSchema = z.object({
  type: z.literal('plugin-read-checked'),
  at: z.string(),
  tool: z.string(),
  path: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
})

const IdentityVerifiedSchema = z.object({
  type: z.literal('identity-verified'),
  at: z.string(),
  status: z.string(),
  transcriptPath: z.string(),
})

const ContextRequestedSchema = z.object({
  type: z.literal('context-requested'),
  at: z.string(),
  agentName: z.string(),
})

const JournalEntrySchema = z.object({
  type: z.literal('journal-entry'),
  at: z.string(),
  agentName: z.string(),
  content: z.string(),
})

export const WorkflowEventSchema = z.discriminatedUnion('type', [
  SessionStartedSchema,
  IssueRecordedSchema,
  BranchRecordedSchema,
  PlanApprovalRecordedSchema,
  IterationTaskAssignedSchema,
  DeveloperDoneSignaledSchema,
  PrRecordedSchema,
  PrCreatedSchema,
  IssueChecklistAppendedSchema,
  IterationTickedSchema,
  ReviewApprovedSchema,
  ReviewRejectedSchema,
  CoderabbitAddressedSchema,
  CoderabbitIgnoredSchema,
  LintRanSchema,
  AgentRegisteredSchema,
  AgentShutDownSchema,
  TransitionedSchema,
  IdleCheckedSchema,
  WriteCheckedSchema,
  BashCheckedSchema,
  PluginReadCheckedSchema,
  IdentityVerifiedSchema,
  ContextRequestedSchema,
  JournalEntrySchema,
])

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>

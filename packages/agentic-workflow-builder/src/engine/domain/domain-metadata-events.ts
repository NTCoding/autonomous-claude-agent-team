import { z } from 'zod'

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

const PrRecordedSchema = z.object({
  type: z.literal('pr-recorded'),
  at: z.string(),
  prNumber: z.number(),
})

export const DomainMetadataEventSchema = z.discriminatedUnion('type', [
  IssueRecordedSchema,
  BranchRecordedSchema,
  PrRecordedSchema,
])

export type DomainMetadataEvent = z.infer<typeof DomainMetadataEventSchema>
export type IssueRecordedEvent = z.infer<typeof IssueRecordedSchema>
export type BranchRecordedEvent = z.infer<typeof BranchRecordedSchema>
export type PrRecordedEvent = z.infer<typeof PrRecordedSchema>

import { z } from 'zod'

const SessionStartedSchema = z.object({
  type: z.literal('session-started'),
  at: z.string(),
  transcriptPath: z.string().optional(),
  repository: z.string().optional(),
  currentState: z.string().optional(),
  states: z.array(z.string()).optional(),
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

const JournalEntrySchema = z.object({
  type: z.literal('journal-entry'),
  at: z.string(),
  agentName: z.string(),
  content: z.string(),
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

const IdleCheckedSchema = z.object({
  type: z.literal('idle-checked'),
  at: z.string(),
  agentName: z.string(),
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

export const EngineEventSchema = z.discriminatedUnion('type', [
  SessionStartedSchema,
  TransitionedSchema,
  AgentRegisteredSchema,
  AgentShutDownSchema,
  JournalEntrySchema,
  WriteCheckedSchema,
  BashCheckedSchema,
  PluginReadCheckedSchema,
  IdleCheckedSchema,
  IdentityVerifiedSchema,
  ContextRequestedSchema,
])

export type EngineEvent = z.infer<typeof EngineEventSchema>

export type SessionStartedEvent = z.infer<typeof SessionStartedSchema>
export type TransitionedEvent = z.infer<typeof TransitionedSchema>
export type AgentRegisteredEvent = z.infer<typeof AgentRegisteredSchema>
export type AgentShutDownEvent = z.infer<typeof AgentShutDownSchema>
export type JournalEntryEvent = z.infer<typeof JournalEntrySchema>
export type WriteCheckedEvent = z.infer<typeof WriteCheckedSchema>
export type BashCheckedEvent = z.infer<typeof BashCheckedSchema>
export type PluginReadCheckedEvent = z.infer<typeof PluginReadCheckedSchema>
export type IdleCheckedEvent = z.infer<typeof IdleCheckedSchema>
export type IdentityVerifiedEvent = z.infer<typeof IdentityVerifiedSchema>
export type ContextRequestedEvent = z.infer<typeof ContextRequestedSchema>

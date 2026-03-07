import { z } from 'zod'

export const HookCommonInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string(),
})

export const PreToolUseInputSchema = HookCommonInputSchema.extend({
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_use_id: z.string(),
})

export const SubagentStartInputSchema = HookCommonInputSchema.extend({
  agent_id: z.string(),
  agent_type: z.string(),
})

export const TeammateIdleInputSchema = HookCommonInputSchema.extend({
  teammate_name: z.string().optional(),
})

export type PreToolUseInput = z.infer<typeof PreToolUseInputSchema>
export type SubagentStartInput = z.infer<typeof SubagentStartInputSchema>
export type TeammateIdleInput = z.infer<typeof TeammateIdleInputSchema>

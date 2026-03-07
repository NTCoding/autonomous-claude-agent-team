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

export type PreToolUseInput = z.infer<typeof PreToolUseInputSchema>

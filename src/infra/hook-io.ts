import { z } from 'zod'
import { WorkflowError } from './workflow-error.js'

const HookCommonInput = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string(),
})

const PreToolUseInput = HookCommonInput.extend({
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_use_id: z.string(),
})

const SubagentStartInput = HookCommonInput.extend({
  agent_id: z.string(),
  agent_type: z.string(),
})

const TeammateIdleInput = HookCommonInput.extend({
  teammate_name: z.string().optional(),
})

type HookCommonInput = z.infer<typeof HookCommonInput>
type PreToolUseInput = z.infer<typeof PreToolUseInput>
type SubagentStartInput = z.infer<typeof SubagentStartInput>
type TeammateIdleInput = z.infer<typeof TeammateIdleInput>

export const EXIT_ALLOW = 0
export const EXIT_BLOCK = 2
export const EXIT_ERROR = 1

export function parseCommonInput(raw: string): HookCommonInput {
  return parseWithSchema(HookCommonInput, raw, 'HookCommonInput')
}

export function parsePreToolUseInput(raw: string): PreToolUseInput {
  return parseWithSchema(PreToolUseInput, raw, 'PreToolUseInput')
}

export function parseSubagentStartInput(raw: string): SubagentStartInput {
  return parseWithSchema(SubagentStartInput, raw, 'SubagentStartInput')
}

export function parseTeammateIdleInput(raw: string): TeammateIdleInput {
  return parseWithSchema(TeammateIdleInput, raw, 'TeammateIdleInput')
}

export function formatDenyDecision(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
}

export function formatContextInjection(context: string): string {
  return JSON.stringify({ additionalContext: context })
}

function parseWithSchema<T>(schema: z.ZodType<T>, raw: string, schemaName: string): T {
  const json = tryParseHookJson(raw, schemaName)
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new WorkflowError(`Invalid hook input for ${schemaName}: ${result.error.message}`)
  }
  return result.data
}

function tryParseHookJson(raw: string, schemaName: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw new WorkflowError(`Cannot parse hook input JSON for ${schemaName}: ${String(cause)}`)
  }
}

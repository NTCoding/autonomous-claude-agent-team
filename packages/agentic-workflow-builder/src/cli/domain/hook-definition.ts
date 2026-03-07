import type { PreconditionResult } from '../../dsl/index.js'

export type HookCheck<TWorkflow> = {
  readonly extract: (toolInput: Record<string, unknown>) => Record<string, string>
  readonly check: (workflow: TWorkflow, extracted: Record<string, string>, toolName: string) => PreconditionResult
}

export type HookDefinition<TWorkflow> = {
  readonly preToolUse?: Record<string, HookCheck<TWorkflow>>
}

export function defineHooks<TWorkflow>(hooks: HookDefinition<TWorkflow>): HookDefinition<TWorkflow> {
  return hooks
}

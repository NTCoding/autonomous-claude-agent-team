import type { PreToolUseInput } from '../infra/hook-io.js'
import { checkPluginSourceRead } from '../domain/hook-rules.js'
import { formatDenyDecision, EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type BlockPluginReadsDeps = {
  readonly getPluginRoot: () => string
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
}

export function runBlockPluginReads(
  hookInput: PreToolUseInput,
  deps: BlockPluginReadsDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(hookInput.session_id)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const filePath = resolveStringField(hookInput.tool_input['file_path'])
    || resolveStringField(hookInput.tool_input['path'])
    || resolveStringField(hookInput.tool_input['pattern'])
  const command = resolveStringField(hookInput.tool_input['command'])
  const pluginRoot = deps.getPluginRoot()

  const decision = checkPluginSourceRead(hookInput.tool_name, filePath, command, pluginRoot)

  if (!decision.allow) {
    return { output: formatDenyDecision(decision.reason), exitCode: EXIT_BLOCK }
  }

  return { output: '', exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return ''
}

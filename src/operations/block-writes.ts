import type { WorkflowState } from '../domain/workflow-state.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import { checkWriteBlock, checkBashWriteBlock } from '../domain/hook-rules.js'
import { formatDenyDecision, EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type BlockWritesDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
}

export function runBlockWrites(
  sessionId: string,
  hookInput: PreToolUseInput,
  deps: BlockWritesDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)
  const filePath = resolveStringField(hookInput.tool_input['file_path'])
  const writeDecision = checkWriteBlock(state, hookInput.tool_name, filePath)

  if (!writeDecision.allow) {
    return { output: formatDenyDecision(writeDecision.reason), exitCode: EXIT_BLOCK }
  }

  const command = resolveStringField(hookInput.tool_input['command'])
  const bashDecision = checkBashWriteBlock(state, hookInput.tool_name, command)

  if (!bashDecision.allow) {
    return { output: formatDenyDecision(bashDecision.reason), exitCode: EXIT_BLOCK }
  }

  return { output: '', exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return ''
}

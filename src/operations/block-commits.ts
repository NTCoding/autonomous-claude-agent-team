import type { WorkflowState } from '../domain/workflow-state.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import { checkCommitBlock } from '../domain/hook-rules.js'
import { formatDenyDecision, EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type BlockCommitsDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
}

export function runBlockCommits(
  sessionId: string,
  hookInput: PreToolUseInput,
  deps: BlockCommitsDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)
  const command = resolveStringField(hookInput.tool_input['command'])
  const decision = checkCommitBlock(state, command)

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

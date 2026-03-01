import type { WorkflowState } from '../domain/workflow-state.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import type { AssistantMessage } from '../domain/identity-rules.js'
import { checkLeadIdentity } from '../domain/identity-rules.js'
import { getProcedurePath } from '../domain/state-procedure-map.js'
import { formatContextInjection, EXIT_ALLOW } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type VerifyIdentityDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly readTranscriptMessages: (path: string) => readonly AssistantMessage[]
  readonly readFile: (path: string) => string
  readonly getPluginRoot: () => string
}

export function runVerifyIdentity(
  sessionId: string,
  hookInput: PreToolUseInput,
  deps: VerifyIdentityDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)
  const messages = deps.readTranscriptMessages(hookInput.transcript_path)
  const result = checkLeadIdentity(messages, state.state)

  if (result.status === 'lost') {
    const procedurePath = getProcedurePath(state.state, deps.getPluginRoot())
    const procedureContent = deps.readFile(procedurePath)
    return { output: formatContextInjection(`${result.recoveryMessage}\n\n${procedureContent}`), exitCode: EXIT_ALLOW }
  }

  return { output: '', exitCode: EXIT_ALLOW }
}

import type { WorkflowState } from '../domain/workflow-state.js'
import type { SubagentStartInput } from '../infra/hook-io.js'
import { createEventEntry } from '../domain/event-log.js'
import { formatContextInjection, EXIT_ALLOW } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type InjectSubagentContextDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
}

export function runInjectSubagentContext(
  sessionId: string,
  hookInput: SubagentStartInput,
  deps: InjectSubagentContextDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }

  const state = deps.readState(statePath)

  const updatedState = registerAgent(state, hookInput.agent_type, hookInput.agent_id, deps.now())
  deps.writeState(statePath, updatedState)
  const context = buildSubagentContext(updatedState)
  return { output: formatContextInjection(context), exitCode: EXIT_ALLOW }
}

function registerAgent(state: WorkflowState, agentType: string, agentId: string, now: string): WorkflowState {
  const alreadyRegistered = state.activeAgents.includes(agentType)
  return {
    ...state,
    activeAgents: alreadyRegistered ? state.activeAgents : [...state.activeAgents, agentType],
    eventLog: [
      ...state.eventLog,
      createEventEntry('subagent-start', now, { agent: agentType, agentId }),
    ],
  }
}

const CMD = '/autonomous-claude-agent-team:workflow'

function buildSubagentContext(state: WorkflowState): string {
  return (
    `Current workflow state: ${state.state}\n` +
    `Active agents: [${state.activeAgents.join(', ')}]\n\n` +
    `CLI commands:\n` +
    `  signal-done:  ${CMD} signal-done\n` +
    `  run-lint:     ${CMD} run-lint <files>\n` +
    `  record-pr:    ${CMD} record-pr <number>`
  )
}

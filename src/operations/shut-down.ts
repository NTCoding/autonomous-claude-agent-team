import type { WorkflowState } from '../domain/workflow-state.js'
import { createEventEntry } from '../domain/event-log.js'
import { EXIT_ALLOW, EXIT_ERROR } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type ShutDownDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
}

export function runShutDown(
  sessionId: string,
  agentName: string,
  deps: ShutDownDeps,
): OperationResult {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) {
    return { output: `shut-down: no state file for session '${sessionId}'`, exitCode: EXIT_ERROR }
  }

  const state = deps.readState(statePath)
  const idx = state.activeAgents.indexOf(agentName)
  const updatedAgents =
    idx === -1
      ? state.activeAgents
      : [...state.activeAgents.slice(0, idx), ...state.activeAgents.slice(idx + 1)]

  const updatedState: WorkflowState = {
    ...state,
    activeAgents: updatedAgents,
    eventLog: [...state.eventLog, createEventEntry('shut-down', deps.now(), { agent: agentName })],
  }
  deps.writeState(statePath, updatedState)
  return {
    output: `shut-down: agent '${agentName}' deregistered. Active agents: [${updatedAgents.join(', ')}]`,
    exitCode: EXIT_ALLOW,
  }
}

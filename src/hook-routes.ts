import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import type { RunnerResult } from '@ntcoding/agentic-workflow-builder/cli'
import {
  HookCommonInputSchema,
  PreToolUseInputSchema,
  SubagentStartInputSchema,
  TeammateIdleInputSchema,
} from '@ntcoding/agentic-workflow-builder/cli'
import { FeatureTeamWorkflowDefinition, BASH_FORBIDDEN, checkWriteAllowed } from './workflow-definition/index.js'
import type { Workflow, WorkflowDeps } from './workflow-definition/index.js'
import type { StateName, WorkflowOperation, WorkflowState } from './workflow-definition/domain/workflow-types.js'
import type { AdapterDeps } from './infra/composition-root.js'
import {
  formatDenyDecision,
  formatContextInjection,
  EXIT_ALLOW,
  EXIT_ERROR,
  EXIT_BLOCK,
} from './infra/hook-io.js'
import { WorkflowError } from './infra/workflow-error.js'

type Engine = WorkflowEngine<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>

type HookHandler = (engine: Engine, deps: AdapterDeps) => RunnerResult

const HOOK_HANDLERS: Readonly<Record<string, HookHandler>> = {
  SessionStart: handleSessionStart,
  PreToolUse: handlePreToolUse,
  SubagentStart: handleSubagentStart,
  TeammateIdle: handleTeammateIdle,
}

export function handleHookRoute(deps: AdapterDeps): RunnerResult {
  const engine = new WorkflowEngine(FeatureTeamWorkflowDefinition, deps.engineDeps, deps.workflowDeps)
  const stdin = deps.readStdin()
  const cachedDeps: AdapterDeps = { ...deps, readStdin: () => stdin }
  const common = HookCommonInputSchema.parse(JSON.parse(stdin))
  const handler = HOOK_HANDLERS[common.hook_event_name]
  if (!handler) {
    return { output: `Unknown hook event: ${common.hook_event_name}`, exitCode: EXIT_ERROR }
  }
  if (common.hook_event_name !== 'SessionStart' && !engine.hasSession(common.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }
  return handler(engine, cachedDeps)
}

function handleSessionStart(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = HookCommonInputSchema.parse(JSON.parse(deps.readStdin()))
  engine.persistSessionId(hookInput.session_id)
  return { output: '', exitCode: EXIT_ALLOW }
}

function handlePreToolUse(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = PreToolUseInputSchema.parse(JSON.parse(deps.readStdin()))

  const filePath = resolveStringField(hookInput.tool_input['file_path'])
    || resolveStringField(hookInput.tool_input['path'])
    || resolveStringField(hookInput.tool_input['pattern'])
  const command = resolveStringField(hookInput.tool_input['command'])

  const pluginCheck = engine.transaction(hookInput.session_id, 'hook-check', (w) => {
    return w.checkPluginSourceRead(hookInput.tool_name, filePath, command)
  }, hookInput.transcript_path)
  if (pluginCheck.type === 'blocked') return { output: formatDenyDecision(pluginCheck.output), exitCode: EXIT_BLOCK }

  const writeCheck = engine.checkWrite(hookInput.session_id, hookInput.tool_name, filePath, checkWriteAllowed, hookInput.transcript_path)
  if (writeCheck.type === 'blocked') return { output: formatDenyDecision(writeCheck.output), exitCode: EXIT_BLOCK }

  const bashCheck = engine.checkBash(hookInput.session_id, hookInput.tool_name, command, BASH_FORBIDDEN, hookInput.transcript_path)
  if (bashCheck.type === 'blocked') return { output: formatDenyDecision(bashCheck.output), exitCode: EXIT_BLOCK }

  return { output: '', exitCode: EXIT_ALLOW }
}

function handleSubagentStart(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = SubagentStartInputSchema.parse(JSON.parse(deps.readStdin()))
  const result = engine.transaction(hookInput.session_id, 'register-agent', (w) => {
    return w.registerAgent(hookInput.agent_type, hookInput.agent_id)
  })
  /* v8 ignore next */
  const state = result.type === 'success' ? result.output : ''
  return { output: formatContextInjection(state), exitCode: EXIT_ALLOW }
}

function handleTeammateIdle(engine: Engine, deps: AdapterDeps): RunnerResult {
  const hookInput = TeammateIdleInputSchema.parse(JSON.parse(deps.readStdin()))
  const agentName = hookInput.teammate_name ?? ''
  const result = engine.transaction(hookInput.session_id, 'check-idle', (w) => w.checkIdleAllowed(agentName))
  if (result.type === 'blocked') {
    return { output: result.output, exitCode: EXIT_BLOCK }
  }
  return { output: '', exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new WorkflowError(`Expected string or undefined. Got ${typeof value}: ${String(value)}`)
}

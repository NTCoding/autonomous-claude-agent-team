import type { PreconditionResult } from '../../workflow-dsl/index.js'
import { pass, fail } from '../../workflow-dsl/index.js'
import type { WorkflowState } from '../../workflow-engine/index.js'
import { GLOBAL_FORBIDDEN, getStateDefinition } from './registry.js'
export { GLOBAL_FORBIDDEN }
import type { WorkflowOperation } from './workflow-types.js'

export const COMMIT_BLOCKED_STATES: ReadonlySet<string> = new Set(['DEVELOPING', 'REVIEWING'])
export const FILE_WRITING_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'NotebookEdit'])
export const READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep'])
export const BASH_READ_PATTERN = /\b(?:cat|head|tail|less|more|grep|rg|find|ls)\b/

const LEAD_IDLE_ALLOWED: ReadonlySet<string> = new Set(['BLOCKED', 'COMPLETE'])

export function isStateFile(filePath: string): boolean {
  return filePath.includes('feature-team-state-') && filePath.endsWith('.json')
}

export function isPluginSourcePath(text: string, pluginRoot: string): boolean {
  if (!GLOBAL_FORBIDDEN.pluginSourcePattern.test(text)) {
    return false
  }
  const agentsMdPattern = new RegExp(`${escapeRegExp(pluginRoot)}/agents/`)
  if (agentsMdPattern.test(text)) {
    return false
  }
  return true
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function checkLeadIdle(state: WorkflowState): PreconditionResult {
  if (LEAD_IDLE_ALLOWED.has(state.state)) {
    return pass()
  }
  const allowedStates = [...LEAD_IDLE_ALLOWED].join(' or ')
  return fail(`Lead cannot go idle in ${state.state} state. Transition to ${allowedStates} before stopping, or continue working.`)
}

export function checkDeveloperIdle(state: WorkflowState): PreconditionResult {
  if (state.state !== 'DEVELOPING') {
    return pass()
  }
  const currentIteration = state.iterations[state.iteration]
  if (currentIteration?.developerDone) {
    return pass()
  }
  return fail(
    `Developer cannot go idle in ${state.state} without signalling done. Run lint on all changed files, fix all violations, then run signal-done. Follow the workflow checklist in your agent instructions.`,
  )
}

export function checkOperationGate(op: WorkflowOperation, state: WorkflowState): PreconditionResult {
  const currentDef = getStateDefinition(state.state)
  if (currentDef.allowedWorkflowOperations.includes(op)) {
    return pass()
  }
  return fail(`${op} is not allowed in state ${state.state}.`)
}

import type { StateName, WorkflowState } from './workflow-state.js'

export type HookDecision = { allow: true } | { allow: false; reason: string }
export type WriteBlockDecision = HookDecision
export type CommitBlockDecision = HookDecision
export type IdleDecision = HookDecision

const WRITE_BLOCKING_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])
const GIT_COMMIT_PATTERN = /(?:^|\s|&&|;)git\s+(?:commit|push)(?:\s|$|-|;|&)/

export function checkWriteBlock(
  state: WorkflowState,
  toolName: string,
  filePath: string,
): WriteBlockDecision {
  if (state.state !== 'RESPAWN') {
    return { allow: true }
  }

  if (!WRITE_BLOCKING_TOOLS.has(toolName)) {
    return { allow: true }
  }

  if (filePath.includes('feature-team-state-') && filePath.endsWith('.json')) {
    return { allow: true }
  }

  return {
    allow: false,
    reason:
      'File writes are blocked during RESPAWN.\n\nNo implementation work happens during RESPAWN. Wait for the lead to transition to DEVELOPING.\n\nLead runs:\n  node "${PLUGIN_ROOT}/dist/workflow.js" transition DEVELOPING',
  }
}

export function checkBashWriteBlock(
  state: WorkflowState,
  toolName: string,
  command: string,
): WriteBlockDecision {
  if (state.state !== 'RESPAWN') {
    return { allow: true }
  }

  if (toolName !== 'Bash') {
    return { allow: true }
  }

  if (!GIT_COMMIT_PATTERN.test(command)) {
    return { allow: true }
  }

  return {
    allow: false,
    reason:
      'git commit/push blocked during RESPAWN.\n\nNo commits during RESPAWN. Wait for the lead to transition to DEVELOPING.',
  }
}

export function checkCommitBlock(state: WorkflowState, command: string): CommitBlockDecision {
  if (!state.commitsBlocked) {
    return { allow: true }
  }

  if (!GIT_COMMIT_PATTERN.test(command)) {
    return { allow: true }
  }

  return {
    allow: false,
    reason:
      'Cannot commit during DEVELOPING or REVIEWING.\n\nCommits are blocked until the reviewer approves changes. Developer must signal completion first, then lead transitions to REVIEWING.\n\nDeveloper runs:\n  node "${PLUGIN_ROOT}/dist/workflow.js" signal-done\n\nThen lead transitions:\n  node "${PLUGIN_ROOT}/dist/workflow.js" transition REVIEWING',
  }
}

const PLUGIN_SOURCE_PATTERN = /\.claude\/plugins\/cache\//
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep'])
const BASH_READ_PATTERN = /\b(?:cat|head|tail|less|more|grep|rg|find|ls)\b/

export function checkPluginSourceRead(
  toolName: string,
  filePath: string,
  command: string,
  pluginRoot: string,
): HookDecision {
  if (READ_TOOLS.has(toolName) && isPluginSourcePath(filePath, pluginRoot)) {
    return {
      allow: false,
      reason: 'Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.',
    }
  }

  if (toolName === 'Bash' && BASH_READ_PATTERN.test(command) && isPluginSourcePath(command, pluginRoot)) {
    return {
      allow: false,
      reason: 'Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.',
    }
  }

  return { allow: true }
}

function isPluginSourcePath(text: string, pluginRoot: string): boolean {
  if (!PLUGIN_SOURCE_PATTERN.test(text)) {
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

const LEAD_IDLE_ALLOWED_STATES: ReadonlySet<StateName> = new Set(['BLOCKED', 'COMPLETE'])

export function checkIdleAllowed(
  state: WorkflowState,
  agentName: string,
): IdleDecision {
  if (agentName.includes('lead')) {
    return checkLeadIdle(state)
  }

  if (agentName.includes('developer')) {
    return checkDeveloperIdle(state)
  }

  return { allow: true }
}

function checkLeadIdle(state: WorkflowState): IdleDecision {
  if (LEAD_IDLE_ALLOWED_STATES.has(state.state)) {
    return { allow: true }
  }

  return {
    allow: false,
    reason: `Lead cannot go idle in ${state.state} state. Transition to BLOCKED or COMPLETE before stopping, or continue working.`,
  }
}

function checkDeveloperIdle(state: WorkflowState): IdleDecision {
  if (state.state !== 'DEVELOPING') {
    return { allow: true }
  }

  if (state.developerDone) {
    return { allow: true }
  }

  return {
    allow: false,
    reason:
      'Developer cannot go idle in DEVELOPING without signalling done.\n\n1. Run lint: node "${PLUGIN_ROOT}/dist/workflow.js" run-lint <changed-files>\n2. Fix all violations.\n3. Signal done: node "${PLUGIN_ROOT}/dist/workflow.js" signal-done',
  }
}

import type { WorkflowFactory, BaseEvent, PrefixConfig } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowStateError } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowState } from './workflow-types.js'
import { Workflow, type WorkflowDeps } from './workflow.js'
import { INITIAL_STATE, STATE_EMOJI_MAP, parseStateName } from './workflow-types.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { applyEvents } from './fold.js'
import { WorkflowEventSchema } from './workflow-events.js'

const LEAD_PREFIX_PATTERN = /^LEAD:/m

function buildLeadPrefix(state: string, emoji: string): string {
  return `${emoji} LEAD: ${state}`
}

function buildRecoveryMessage(state: string, emoji: string, _pluginRoot: string): string {
  const prefix = buildLeadPrefix(state, emoji)
  const stateLower = state.toLowerCase().replace(/_/g, '-')
  return (
    `You have lost your feature-team-lead identity. Re-read \${CLAUDE_PLUGIN_ROOT}/agents/feature-team-lead.md. ` +
    `Current state: ${state}. Every message MUST start with the state prefix — ` +
    `your next response MUST begin with: '${prefix}'. ` +
    `Read \${CLAUDE_PLUGIN_ROOT}/states/${stateLower}.md for your current procedure.`
  )
}

export const WorkflowAdapter: WorkflowFactory<Workflow, WorkflowState, WorkflowDeps> = {
  createFresh(deps: WorkflowDeps): Workflow {
    return Workflow.createFresh(deps)
  },
  rehydrate(events: readonly BaseEvent[], deps: WorkflowDeps): Workflow {
    const workflowEvents = events.map((e) => {
      const result = WorkflowEventSchema.safeParse(e)
      if (!result.success) {
        throw new WorkflowStateError(`Unknown event type in store: "${e.type}". Event store may be corrupted or from a newer version.`)
      }
      return result.data
    })
    const state = applyEvents(workflowEvents)
    return Workflow.rehydrate(state, deps)
  },
  procedurePath(state: string, pluginRoot: string): string {
    return Workflow.procedurePath(state, pluginRoot)
  },
  initialState(): typeof INITIAL_STATE {
    return INITIAL_STATE
  },
  getEmojiForState(state: string): string {
    return STATE_EMOJI_MAP[parseStateName(state)]
  },
  getOperationBody,
  getTransitionTitle,
  getPrefixConfig(): PrefixConfig {
    return { pattern: LEAD_PREFIX_PATTERN, buildRecoveryMessage }
  },
}

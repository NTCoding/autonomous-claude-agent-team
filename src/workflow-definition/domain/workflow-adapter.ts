import type { WorkflowFactory, BaseEvent, PrefixConfig } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowStateError } from '@ntcoding/agentic-workflow-builder/engine'
import type { TransitionContext } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowState, StateName, WorkflowOperation } from './workflow-types.js'
import { parseStateName } from './workflow-types.js'
import { Workflow, type WorkflowDeps } from './workflow.js'
import { INITIAL_STATE } from './workflow-types.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { applyEvents } from './fold.js'
import { WorkflowEventSchema } from './workflow-events.js'
import { WORKFLOW_REGISTRY } from './registry.js'

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

export const WorkflowAdapter: WorkflowFactory<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation> = {
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
  procedurePath(state: StateName, pluginRoot: string): string {
    return Workflow.procedurePath(state, pluginRoot)
  },
  initialState(): typeof INITIAL_STATE {
    return INITIAL_STATE
  },
  getRegistry() {
    return WORKFLOW_REGISTRY
  },
  buildTransitionContext(state: WorkflowState, from: StateName, to: StateName, deps: WorkflowDeps): TransitionContext<WorkflowState, StateName> {
    const prChecksPass = state.prNumber === undefined ? false : deps.checkPrChecks(state.prNumber)
    return { state, gitInfo: deps.getGitInfo(), prChecksPass, from, to }
  },
  getOperationBody,
  getTransitionTitle,
  buildTransitionEvent(from: StateName, to: StateName, stateBefore: WorkflowState, stateAfter: WorkflowState, now: string): BaseEvent {
    const iterationChanged = stateAfter.iteration !== stateBefore.iteration
    const developingHeadCommit = to === 'DEVELOPING'
      ? stateAfter.iterations[stateAfter.iteration]?.developingHeadCommit
      : undefined
    const event = {
      type: 'transitioned',
      at: now,
      from,
      to,
      ...(iterationChanged ? { iteration: stateAfter.iteration } : {}),
      ...(developingHeadCommit === undefined ? {} : { developingHeadCommit }),
    }
    return event
  },
  parseStateName,
  getPrefixConfig(): PrefixConfig {
    return { pattern: LEAD_PREFIX_PATTERN, buildRecoveryMessage }
  },
}

import type { WorkflowDefinition, BaseEvent } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowStateError } from '@ntcoding/agentic-workflow-builder/engine'
import type { TransitionContext } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowState, StateName, WorkflowOperation } from './workflow-types.js'
import { StateNameSchema, INITIAL_STATE } from './workflow-types.js'
import { Workflow, type WorkflowDeps } from './workflow.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { applyEvent } from './fold.js'
import { WorkflowEventSchema } from './workflow-events.js'
import { WORKFLOW_REGISTRY } from './registry.js'

function fold(state: WorkflowState, event: BaseEvent): WorkflowState {
  const result = WorkflowEventSchema.safeParse(event)
  if (!result.success) {
    throw new WorkflowStateError(`Unknown event type in store: "${event.type}". Event store may be corrupted or from a newer version.`)
  }
  return applyEvent(state, result.data)
}

function buildWorkflow(state: WorkflowState, deps: WorkflowDeps): Workflow {
  return Workflow.rehydrate(state, deps)
}

export const FeatureTeamWorkflowDefinition: WorkflowDefinition<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation> = {
  fold,
  buildWorkflow,
  stateSchema: StateNameSchema,
  initialState(): typeof INITIAL_STATE {
    return INITIAL_STATE
  },
  getRegistry() {
    return WORKFLOW_REGISTRY
  },
  buildTransitionContext(state: WorkflowState, from: StateName, to: StateName, deps: WorkflowDeps): TransitionContext<WorkflowState, StateName> {
    const prChecksPass = state.prNumber === undefined ? false : deps.checkPrChecks(state.prNumber)
    const contextWithWorkflowData = { state, gitInfo: deps.getGitInfo(), prChecksPass, from, to }
    return contextWithWorkflowData
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
}

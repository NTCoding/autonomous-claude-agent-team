import type { WorkflowFactory, WorkflowRuntimeDeps, BaseEvent } from '../../workflow-engine/index.js'
import { WorkflowStateError } from '../../workflow-engine/index.js'
import { Workflow } from './workflow.js'
import { INITIAL_STATE, STATE_EMOJI_MAP } from './workflow-types.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { fold } from './fold.js'
import { WorkflowEventSchema } from './workflow-events.js'

export const WorkflowAdapter: WorkflowFactory<Workflow> = {
  rehydrate(events: readonly BaseEvent[], deps: WorkflowRuntimeDeps): Workflow {
    const workflowEvents = events.map((e) => {
      const result = WorkflowEventSchema.safeParse(e)
      if (!result.success) {
        throw new WorkflowStateError(`Unknown event type in store: "${e.type}". Event store may be corrupted or from a newer version.`)
      }
      return result.data
    })
    const state = fold(workflowEvents)
    return Workflow.rehydrate(state, deps)
  },
  procedurePath(state: string, pluginRoot: string): string {
    return Workflow.procedurePath(state, pluginRoot)
  },
  initialState(): typeof INITIAL_STATE {
    return INITIAL_STATE
  },
  getEmojiForState(state: string): string {
    return STATE_EMOJI_MAP[state] ?? ''
  },
  getOperationBody,
  getTransitionTitle,
}

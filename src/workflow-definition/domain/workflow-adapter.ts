import type { WorkflowFactory, WorkflowRuntimeDeps, WorkflowState } from '../../workflow-engine/index.js'
import { Workflow } from './workflow.js'
import { INITIAL_STATE, STATE_EMOJI_MAP } from './workflow-types.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'

export const WorkflowAdapter: WorkflowFactory<Workflow> = {
  rehydrate(state: WorkflowState, deps: WorkflowRuntimeDeps): Workflow {
    return Workflow.rehydrate(state, deps)
  },
  procedurePath(state: string, pluginRoot: string): string {
    return Workflow.procedurePath(state, pluginRoot)
  },
  initialState(): WorkflowState {
    return INITIAL_STATE
  },
  getEmojiForState(state: string): string {
    /* v8 ignore next */
    return STATE_EMOJI_MAP[state] ?? ''
  },
  getOperationBody,
  getTransitionTitle,
}

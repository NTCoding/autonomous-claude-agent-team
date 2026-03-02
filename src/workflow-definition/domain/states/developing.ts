import type { ConcreteStateDefinition } from '../workflow-types.js'
import type { WorkflowState } from '../../../workflow-engine/index.js'
import { WorkflowStateError } from '../../../workflow-engine/index.js'
import { pass, fail } from '../../../workflow-dsl/index.js'

export const developingState: ConcreteStateDefinition = {
  emoji: '🔨',
  agentInstructions: 'states/developing.md',
  canTransitionTo: ['REVIEWING', 'BLOCKED'],
  allowedWorkflowOperations: ['signal-done'],

  transitionGuard: (ctx) => {
    const currentIteration = ctx.state.iterations[ctx.state.iteration]
    if (!currentIteration?.developerDone)
      return fail('developerDone is false. Developer must run signal-done first.')
    if (ctx.gitInfo.workingTreeClean)
      return fail('No uncommitted changes found.')
    if (currentIteration.developingHeadCommit !== undefined && ctx.gitInfo.headCommit !== currentIteration.developingHeadCommit)
      return fail(`New commits detected. HEAD was '${currentIteration.developingHeadCommit}'.`)
    return pass()
  },

  onEntry: (state: WorkflowState, ctx): WorkflowState => {
    const targetIdx = ctx.from === 'RESPAWN' ? state.iterations.length - 1 : state.iteration
    const currentIteration = state.iterations[targetIdx]
    /* v8 ignore next 3 -- guard in respawn/reviewing prevents reaching here without a valid iteration */
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration entry found at index ${targetIdx}. Run assign-iteration-task first.`)
    }

    return {
      ...state,
      iteration: targetIdx,
      iterations: state.iterations.map((iter, i) =>
        i === targetIdx
          ? {
              ...iter,
              developerDone: false,
              developingHeadCommit: ctx.gitInfo.headCommit,
              lintedFiles: [],
              lintRanIteration: false,
            }
          : iter
      ),
    }
  },
}

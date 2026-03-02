import type { ConcreteStateDefinition } from '../../workflow-types.js'
import { pass, fail } from '../../../../workflow-dsl/index.js'

export const committingState: ConcreteStateDefinition = {
  emoji: '💾',
  agentInstructions: 'states/committing.md',
  canTransitionTo: ['RESPAWN', 'CR_REVIEW', 'BLOCKED'],
  allowedWorkflowOperations: ['tick-iteration'],

  allowForbidden: {
    bash: ['git commit', 'git push'],
  },

  transitionGuard: (ctx) => {
    if (!ctx.gitInfo.workingTreeClean)
      return fail('Uncommitted changes detected.')

    const lintable = ctx.gitInfo.changedFilesVsDefault.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    if (lintable.length > 0) {
      const currentIteration = ctx.state.iterations[ctx.state.iteration]
      if (!currentIteration?.lintRanIteration)
        return fail('Lint not run this iteration.')
      const unlinted = lintable.filter((f) => !currentIteration.lintedFiles.includes(f))
      if (unlinted.length > 0)
        return fail(`Unlinted files: [${unlinted.join(', ')}].`)
    }

    if (!ctx.gitInfo.hasCommitsVsDefault)
      return fail('No commits beyond default branch.')

    return pass()
  },
}

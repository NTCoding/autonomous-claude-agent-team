import { WorkflowAdapter } from './workflow-adapter.js'
import { INITIAL_STATE } from './workflow-types.js'
import type { WorkflowRuntimeDeps } from '../../workflow-engine/index.js'

function makeWorkflowDeps(): WorkflowRuntimeDeps {
  return {
    getGitInfo: () => ({
      currentBranch: 'main',
      workingTreeClean: true,
      headCommit: 'abc123',
      changedFilesVsDefault: [],
      hasCommitsVsDefault: false,
    }),
    checkPrChecks: () => true,
    createDraftPr: () => 99,
    appendIssueChecklist: () => undefined,
    tickFirstUncheckedIteration: () => undefined,
    runEslintOnFiles: () => true,
    fileExists: () => false,
    getPluginRoot: () => '/plugin',
    now: () => '2026-01-01T00:00:00.000Z',
  }
}

describe('WorkflowAdapter', () => {
  it('rehydrates a Workflow from state and deps', () => {
    const workflow = WorkflowAdapter.rehydrate(INITIAL_STATE, makeWorkflowDeps())
    expect(workflow.getState().state).toStrictEqual('SPAWN')
  })

  it('returns procedure path for a given state', () => {
    const path = WorkflowAdapter.procedurePath('SPAWN', '/plugin')
    expect(path).toContain('spawn')
    expect(path).toContain('/plugin/')
  })
})

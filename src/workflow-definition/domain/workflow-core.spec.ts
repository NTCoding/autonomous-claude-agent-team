import { Workflow } from './workflow.js'
import type { WorkflowDeps } from './workflow.js'

function makeDeps(): WorkflowDeps {
  return {
    getGitInfo: () => ({
      currentBranch: 'main',
      workingTreeClean: true,
      headCommit: 'abc123',
      changedFilesVsDefault: [],
      hasCommitsVsDefault: false,
    }),
    checkPrChecks: () => true,
    createDraftPr: () => 1,
    appendIssueChecklist: () => undefined,
    tickFirstUncheckedIteration: () => undefined,
    runEslintOnFiles: () => true,
    fileExists: () => true,
    getPluginRoot: () => '/plugin',
    now: () => '2026-01-01T00:00:00.000Z',
  }
}

describe('Workflow core helpers', () => {
  it('builds procedure paths from state and plugin root', () => {
    expect(Workflow.procedurePath('SPAWN', '/plugin')).toStrictEqual('/plugin/states/spawn.md')
  })

  it('throws when transcript path is missing', () => {
    const workflow = Workflow.createFresh(makeDeps())
    expect(() => workflow.getTranscriptPath()).toThrow('Transcript path not set. Session has not been started.')
  })
})

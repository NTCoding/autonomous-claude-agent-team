import { vi } from 'vitest'
import { execSync } from 'node:child_process'
import { getGitInfo, getRepositoryName } from './git.js'
import { WorkflowError } from './workflow-error.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

const mockExecSync = vi.mocked(execSync)

function setupMocks(options: {
  branch?: string
  status?: string
  head?: string
  defaultBranch?: string | Error
  changedFiles?: string
  revList?: string
}): void {
  mockExecSync.mockReset()

  if (options.defaultBranch instanceof Error) {
    mockExecSync.mockImplementationOnce(() => {
      throw options.defaultBranch
    })
  } else {
    mockExecSync.mockReturnValueOnce(`origin/${options.defaultBranch ?? 'main'}\n`)
  }

  mockExecSync
    .mockReturnValueOnce(`${options.branch ?? 'feature/test'}\n`)
    .mockReturnValueOnce(options.status ?? '')
    .mockReturnValueOnce(`${options.head ?? 'abc123'}\n`)
    .mockReturnValueOnce(options.changedFiles ?? '')
    .mockReturnValueOnce(options.revList ?? '')
}

describe('getGitInfo — current branch', () => {
  it('returns trimmed branch name', () => {
    setupMocks({ branch: 'feature/my-feature' })
    expect(getGitInfo().currentBranch).toStrictEqual('feature/my-feature')
  })
})

describe('getGitInfo — working tree', () => {
  it('returns true when working tree is clean', () => {
    setupMocks({ status: '' })
    expect(getGitInfo().workingTreeClean).toStrictEqual(true)
  })

  it('returns false when working tree has changes', () => {
    setupMocks({ status: ' M src/file.ts\n' })
    expect(getGitInfo().workingTreeClean).toStrictEqual(false)
  })
})

describe('getGitInfo — head commit', () => {
  it('returns trimmed HEAD commit hash', () => {
    setupMocks({ head: 'deadbeef1234' })
    expect(getGitInfo().headCommit).toStrictEqual('deadbeef1234')
  })
})

describe('getGitInfo — default branch detection', () => {
  it('strips origin/ prefix from symbolic ref', () => {
    setupMocks({ defaultBranch: 'main', changedFiles: '', revList: '' })
    const result = getGitInfo()
    expect(result.changedFilesVsDefault).toStrictEqual([])
    expect(result.hasCommitsVsDefault).toStrictEqual(false)
  })

  it('falls back to main when symbolic ref fails', () => {
    setupMocks({ defaultBranch: new WorkflowError('not a git repo') })
    const result = getGitInfo()
    expect(result.changedFilesVsDefault).toStrictEqual([])
  })
})

describe('getGitInfo — changed files', () => {
  it('returns empty array when no files changed', () => {
    setupMocks({ changedFiles: '' })
    expect(getGitInfo().changedFilesVsDefault).toStrictEqual([])
  })

  it('returns list of changed files', () => {
    setupMocks({ changedFiles: 'src/a.ts\nsrc/b.ts\n' })
    expect(getGitInfo().changedFilesVsDefault).toStrictEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('getGitInfo — has commits', () => {
  it('returns false when no commits beyond default branch', () => {
    setupMocks({ revList: '' })
    expect(getGitInfo().hasCommitsVsDefault).toStrictEqual(false)
  })

  it('returns true when commits exist beyond default branch', () => {
    setupMocks({ revList: 'abc123\ndef456\n' })
    expect(getGitInfo().hasCommitsVsDefault).toStrictEqual(true)
  })
})

describe('getRepositoryName', () => {
  it('parses owner/repo from HTTPS URL', () => {
    mockExecSync.mockReturnValueOnce('https://github.com/owner/repo.git\n')
    expect(getRepositoryName()).toStrictEqual('owner/repo')
  })

  it('parses owner/repo from HTTPS URL without .git suffix', () => {
    mockExecSync.mockReturnValueOnce('https://github.com/owner/repo\n')
    expect(getRepositoryName()).toStrictEqual('owner/repo')
  })

  it('parses owner/repo from SSH URL', () => {
    mockExecSync.mockReturnValueOnce('git@github.com:owner/repo.git\n')
    expect(getRepositoryName()).toStrictEqual('owner/repo')
  })

  it('parses owner/repo from SSH URL without .git suffix', () => {
    mockExecSync.mockReturnValueOnce('git@github.com:owner/repo\n')
    expect(getRepositoryName()).toStrictEqual('owner/repo')
  })

  it('returns undefined when remote command fails', () => {
    mockExecSync.mockImplementationOnce(() => { throw new WorkflowError('no remote') })
    expect(getRepositoryName()).toBeUndefined()
  })

  it('returns undefined for unrecognized URL format', () => {
    mockExecSync.mockReturnValueOnce('https://gitlab.com/owner/repo.git\n')
    expect(getRepositoryName()).toBeUndefined()
  })
})

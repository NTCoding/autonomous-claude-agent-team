import { execSync } from 'node:child_process'
import type { GitInfo } from '../domain/preconditions.js'

export function getGitInfo(): GitInfo {
  const defaultBranch = detectDefaultBranch()
  return {
    currentBranch: getCurrentBranch(),
    workingTreeClean: isWorkingTreeClean(),
    headCommit: getHeadCommit(),
    changedFilesVsDefault: getChangedFilesVsDefault(defaultBranch),
    hasCommitsVsDefault: hasCommitsVsDefault(defaultBranch),
  }
}

function getCurrentBranch(): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
}

function isWorkingTreeClean(): boolean {
  return execSync('git status --porcelain', { encoding: 'utf-8' }).trim().length === 0
}

function getHeadCommit(): string {
  return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
}

function detectDefaultBranch(): string {
  try {
    return execSync('git symbolic-ref refs/remotes/origin/HEAD --short', { encoding: 'utf-8' })
      .trim()
      .replace('origin/', '')
  } catch (_cause) {
    return 'main'
  }
}

function getChangedFilesVsDefault(defaultBranch: string): readonly string[] {
  const output = execSync(`git diff --name-only ${defaultBranch} HEAD`, {
    encoding: 'utf-8',
  })
  return output
    .trim()
    .split('\n')
    .filter((f: string) => f.length > 0)
}

function hasCommitsVsDefault(defaultBranch: string): boolean {
  return execSync(`git rev-list HEAD ^${defaultBranch}`, { encoding: 'utf-8' }).trim().length > 0
}

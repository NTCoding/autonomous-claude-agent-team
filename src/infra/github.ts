import { execSync } from 'node:child_process'
import { WorkflowError } from './workflow-error.js'

export function checkPrChecks(prNumber: number): boolean {
  try {
    execSync(`gh pr checks ${prNumber}`, { encoding: 'utf-8', stdio: 'pipe' })
    return true
  } catch (_cause) {
    return false
  }
}

export function createDraftPr(title: string, body: string): number {
  const escapedTitle = title.replace(/'/g, "'\\''")
  const output = execSync(`gh pr create --draft --title '${escapedTitle}' --body-file -`, {
    input: body,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
  const match = /\/pull\/(\d+)/.exec(output)
  if (!match?.[1]) {
    throw new WorkflowError(`createDraftPr: could not parse PR number from output: ${output}`)
  }
  return Number.parseInt(match[1], 10)
}

export function appendIssueChecklist(issueNumber: number, checklist: string): void {
  const existingBody = execSync(
    `gh issue view ${issueNumber} --json body -q .body`,
    { encoding: 'utf-8', stdio: 'pipe' },
  ).trim()
  const updatedBody = `${existingBody}\n\n## Iterations\n${checklist}`
  execSync(`gh issue edit ${issueNumber} --body-file -`, {
    input: updatedBody,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
}

export function tickFirstUncheckedIteration(issueNumber: number): void {
  const body = execSync(
    `gh issue view ${issueNumber} --json body -q .body`,
    { encoding: 'utf-8', stdio: 'pipe' },
  ).trim()
  if (!body.includes('- [ ]')) {
    throw new WorkflowError(`tickFirstUncheckedIteration: no unchecked iteration in issue #${issueNumber}`)
  }
  const updatedBody = body.replace('- [ ]', '- [x]')
  execSync(`gh issue edit ${issueNumber} --body-file -`, {
    input: updatedBody,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
}

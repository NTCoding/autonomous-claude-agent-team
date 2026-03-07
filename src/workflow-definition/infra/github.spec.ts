import { vi, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './github.js'
import { WorkflowError } from './workflow-error.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

const mockExecSync = vi.mocked(execSync)

describe('checkPrChecks', () => {
  it('returns true when gh pr checks succeeds', () => {
    mockExecSync.mockReturnValueOnce('All checks passed')
    expect(checkPrChecks(42)).toStrictEqual(true)
  })

  it('returns false when gh pr checks fails', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new WorkflowError('checks failed')
    })
    expect(checkPrChecks(42)).toStrictEqual(false)
  })
})

describe('createDraftPr', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed PR number from output URL', () => {
    mockExecSync.mockReturnValueOnce('https://github.com/owner/repo/pull/42\n')
    expect(createDraftPr('My PR title', 'PR body')).toStrictEqual(42)
  })

  it('throws when PR number cannot be parsed from output', () => {
    mockExecSync.mockReturnValueOnce('unexpected output with no PR URL')
    expect(() => createDraftPr('My PR', 'body')).toThrow('could not parse PR number')
  })
})

describe('appendIssueChecklist', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads issue body and writes back with appended ## Iterations block', () => {
    const writtenInputs: string[] = []
    mockExecSync
      .mockReturnValueOnce('Existing body text')
      .mockImplementationOnce((_cmd, opts) => {
        const input = opts?.input
        if (typeof input === 'string') writtenInputs.push(input)
        return ''
      })
    appendIssueChecklist(42, '- [ ] Iteration 1: task one')
    expect(writtenInputs[0]).toStrictEqual(
      'Existing body text\n\n## Iterations\n- [ ] Iteration 1: task one',
    )
  })
})

describe('tickFirstUncheckedIteration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('replaces first unchecked iteration with checked and writes back', () => {
    const writtenInputs: string[] = []
    mockExecSync
      .mockReturnValueOnce('## Iterations\n- [ ] Iter 1\n- [ ] Iter 2\n')
      .mockImplementationOnce((_cmd, opts) => {
        const input = opts?.input
        if (typeof input === 'string') writtenInputs.push(input)
        return ''
      })
    tickFirstUncheckedIteration(42)
    expect(writtenInputs[0]).toStrictEqual('## Iterations\n- [x] Iter 1\n- [ ] Iter 2')
  })

  it('throws when no unchecked iteration found in issue body', () => {
    mockExecSync.mockReturnValueOnce('## Iterations\n- [x] Iter 1\n')
    expect(() => tickFirstUncheckedIteration(42)).toThrow('no unchecked iteration')
  })
})

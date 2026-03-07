import { vi, afterEach } from 'vitest'
import { runEslintOnFiles } from './linter.js'
import { execSync } from 'node:child_process'
import { WorkflowError } from './workflow-error.js'

vi.mock('node:child_process')

afterEach(() => {
  vi.clearAllMocks()
})

describe('runEslintOnFiles', () => {
  it('returns true when eslint exits without error', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
    const result = runEslintOnFiles('/plugin/lint/eslint.config.mjs', ['src/foo.ts'])
    expect(result).toStrictEqual(true)
  })

  it('returns false when eslint throws on violation', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new WorkflowError('Command failed: eslint')
    })
    const result = runEslintOnFiles('/plugin/lint/eslint.config.mjs', ['src/foo.ts'])
    expect(result).toStrictEqual(false)
  })

  it('builds command with quoted file paths', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
    runEslintOnFiles('/config.mjs', ['src/a.ts', 'src/b.ts'])
    const call = vi.mocked(execSync).mock.calls[0]
    expect(call?.[0]).toContain('"src/a.ts"')
    expect(call?.[0]).toContain('"src/b.ts"')
  })
})

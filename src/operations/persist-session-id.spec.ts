import { runPersistSessionId } from './persist-session-id.js'
import type { PersistSessionIdDeps } from './persist-session-id.js'

function makeDeps(captureAppend?: (path: string, content: string) => void): PersistSessionIdDeps {
  return {
    getEnvFilePath: () => '/test/claude.env',
    appendToFile: (path, content) => captureAppend?.(path, content),
  }
}

describe('runPersistSessionId', () => {
  it('returns empty output and exit code 0', () => {
    const result = runPersistSessionId('abc123', makeDeps())
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })

  it('appends CLAUDE_SESSION_ID export to env file', () => {
    const appended: Array<{ path: string; content: string }> = []
    const deps = makeDeps((path, content) => appended.push({ path, content }))
    runPersistSessionId('my-session', deps)
    expect(appended[0]?.path).toStrictEqual('/test/claude.env')
    expect(appended[0]?.content).toContain("CLAUDE_SESSION_ID='my-session'")
  })
})

import { EXIT_ALLOW } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type PersistSessionIdDeps = {
  readonly getEnvFilePath: () => string
  readonly appendToFile: (filePath: string, content: string) => void
}

export function runPersistSessionId(
  sessionId: string,
  deps: PersistSessionIdDeps,
): OperationResult {
  const envFilePath = deps.getEnvFilePath()
  deps.appendToFile(envFilePath, `export CLAUDE_SESSION_ID='${sessionId}'\n`)
  return { output: '', exitCode: EXIT_ALLOW }
}

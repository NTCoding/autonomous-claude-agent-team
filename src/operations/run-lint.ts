import type { WorkflowState } from '../domain/workflow-state.js'
import { createEventEntry } from '../domain/event-log.js'
import { EXIT_ALLOW, EXIT_BLOCK } from '../infra/hook-io.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type RunLintDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly now: () => string
  readonly runEslintOnFiles: (configPath: string, files: readonly string[]) => boolean
  readonly fileExists: (path: string) => boolean
  readonly getPluginRoot: () => string
}

export function runLint(
  sessionId: string,
  inputFiles: readonly string[],
  deps: RunLintDeps,
): OperationResult {
  const tsFiles = filterTypeScriptFiles(inputFiles, deps.fileExists)

  if (tsFiles.length === 0) {
    recordLintResult(sessionId, [], deps)
    return { output: formatNoFilesMessage(), exitCode: EXIT_ALLOW }
  }

  const configPath = `${deps.getPluginRoot()}/lint/eslint.config.mjs`
  const passed = deps.runEslintOnFiles(configPath, tsFiles)

  if (!passed) {
    return { output: formatLintFailure(), exitCode: EXIT_BLOCK }
  }

  recordLintResult(sessionId, tsFiles, deps)
  return { output: formatLintSuccess(tsFiles.length), exitCode: EXIT_ALLOW }
}

function filterTypeScriptFiles(
  files: readonly string[],
  fileExists: (path: string) => boolean,
): readonly string[] {
  return files.filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && fileExists(f))
}

function recordLintResult(
  sessionId: string,
  files: readonly string[],
  deps: RunLintDeps,
): void {
  const statePath = deps.getStateFilePath(sessionId)
  if (!deps.stateFileExists(statePath)) return

  const state = deps.readState(statePath)
  const updatedState: WorkflowState = {
    ...state,
    lintRanIteration: state.iteration,
    lintedFiles: [...new Set([...state.lintedFiles, ...files])],
    eventLog: [
      ...state.eventLog,
      createEventEntry('run-lint', deps.now(), { files: files.length, pass: true }),
    ],
  }
  deps.writeState(statePath, updatedState)
}

const CMD = '/autonomous-claude-agent-team:workflow'

function formatNoFilesMessage(): string {
  return (
    `No TypeScript files to lint — lint recorded as passed.\n\n` +
    `To signal done:\n  ${CMD} signal-done`
  )
}

function formatLintSuccess(fileCount: number): string {
  return (
    `Lint passed on ${fileCount} file(s).\n\n` +
    `To signal done:\n  ${CMD} signal-done`
  )
}

function formatLintFailure(): string {
  return (
    `Lint failed. Fix all violations before proceeding.\n\n` +
    `To retry:\n  ${CMD} run-lint <files>`
  )
}

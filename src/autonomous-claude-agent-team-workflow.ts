import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { WorkflowState } from './domain/workflow-state.js'
import { StateName } from './domain/workflow-state.js'
import type { GitInfo } from './domain/preconditions.js'
import type { AssistantMessage } from './domain/identity-rules.js'
import { readState, writeState, stateFileExists } from './infra/state-store.js'
import { getSessionId, getPluginRoot, getEnvFilePath, getStateFilePath } from './infra/environment.js'
import { getGitInfo } from './infra/git.js'
import { checkPrChecks, createDraftPr, appendIssueChecklist, tickFirstUncheckedIteration } from './infra/github.js'
import { readStdinSync } from './infra/stdin.js'
import { readTranscriptMessages } from './infra/transcript.js'
import { runEslintOnFiles } from './infra/linter.js'
import {
  parsePreToolUseInput,
  parseSubagentStartInput,
  parseTeammateIdleInput,
  parseCommonInput,
  EXIT_ERROR,
  EXIT_BLOCK,
} from './infra/hook-io.js'
import { runInit } from './operations/init.js'
import { runTransition } from './operations/transition.js'
import { runRecordIssue } from './operations/record-issue.js'
import { runRecordBranch } from './operations/record-branch.js'
import { runRecordPlanApproval } from './operations/record-plan-approval.js'
import { runAssignIterationTask } from './operations/assign-iteration-task.js'
import { runSignalDone } from './operations/signal-done.js'
import { runRecordPr } from './operations/record-pr.js'
import { runCreatePr } from './operations/create-pr.js'
import { runAppendIssueChecklist } from './operations/append-issue-checklist.js'
import { runTickIteration } from './operations/tick-iteration.js'
import { runLint } from './operations/run-lint.js'
import { runBlockWrites } from './operations/block-writes.js'
import { runBlockCommits } from './operations/block-commits.js'
import { runBlockPluginReads } from './operations/block-plugin-reads.js'
import { runVerifyIdentity } from './operations/verify-identity.js'
import { runInjectStateProcedure } from './operations/inject-state-procedure.js'
import { runInjectSubagentContext } from './operations/inject-subagent-context.js'
import { runEvaluateIdle } from './operations/evaluate-idle.js'
import { runShutDown } from './operations/shut-down.js'
import { runPersistSessionId } from './operations/persist-session-id.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

export type WorkflowDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly getSessionId: () => string
  readonly getPluginRoot: () => string
  readonly getEnvFilePath: () => string
  readonly getGitInfo: () => GitInfo
  readonly checkPrChecks: (prNumber: number) => boolean
  readonly createDraftPr: (title: string, body: string) => number
  readonly appendIssueChecklist: (issueNumber: number, checklist: string) => void
  readonly tickFirstUncheckedIteration: (issueNumber: number) => void
  readonly now: () => string
  readonly readFile: (path: string) => string
  readonly readTranscriptMessages: (path: string) => readonly AssistantMessage[]
  readonly fileExists: (path: string) => boolean
  readonly runEslintOnFiles: (configPath: string, files: readonly string[]) => boolean
  readonly appendToFile: (filePath: string, content: string) => void
  readonly readStdin: () => string
}

type CommandHandler = (args: readonly string[], deps: WorkflowDeps) => OperationResult

const COMMAND_HANDLERS: Readonly<Record<string, CommandHandler>> = {
  init: handleInit,
  transition: handleTransition,
  'record-issue': handleRecordIssue,
  'record-branch': handleRecordBranch,
  'record-plan-approval': handleRecordPlanApproval,
  'assign-iteration-task': handleAssignIterationTask,
  'signal-done': handleSignalDone,
  'record-pr': handleRecordPr,
  'create-pr': handleCreatePr,
  'append-issue-checklist': handleAppendIssueChecklist,
  'tick-iteration': handleTickIteration,
  'run-lint': handleRunLint,
  'shut-down': handleShutDown,
}

const HOOK_HANDLERS: Readonly<Record<string, (deps: WorkflowDeps) => OperationResult>> = {
  SessionStart: (deps) => handlePersistSessionId([], deps),
  PreToolUse: (deps) => runPreToolUseHooks(deps),
  SubagentStart: (deps) => handleSubagentStart([], deps),
  TeammateIdle: (deps) => handleTeammateIdle([], deps),
}

export function runWorkflow(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const command = args[0]
  if (!command) {
    return runHookMode(deps)
  }
  const handler = COMMAND_HANDLERS[command]
  if (!handler) {
    return { output: `Unknown command: ${command}`, exitCode: EXIT_ERROR }
  }
  return handler(args, deps)
}

function runHookMode(deps: WorkflowDeps): OperationResult {
  const stdin = deps.readStdin()
  const cachedDeps: WorkflowDeps = { ...deps, readStdin: () => stdin }
  const common = parseCommonInput(stdin)
  const handler = HOOK_HANDLERS[common.hook_event_name]
  if (!handler) {
    return { output: `Unknown hook event: ${common.hook_event_name}`, exitCode: EXIT_ERROR }
  }
  return handler(cachedDeps)
}

function runPreToolUseHooks(deps: WorkflowDeps): OperationResult {
  for (const handler of [handleBlockPluginReads, handleBlockWrites, handleBlockCommits, handleVerifyIdentity]) {
    const result = handler([], deps)
    if (result.exitCode === EXIT_BLOCK) {
      return result
    }
  }
  return handleInjectState([], deps)
}

function stateDeps(deps: WorkflowDeps) {
  return {
    readState: deps.readState,
    writeState: deps.writeState,
    getStateFilePath: deps.getStateFilePath,
    now: deps.now,
  }
}

function handleInit(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  return runInit(deps.getSessionId(), {
    stateFileExists: deps.stateFileExists,
    writeState: deps.writeState,
    getStateFilePath: deps.getStateFilePath,
    readFile: deps.readFile,
    getPluginRoot: deps.getPluginRoot,
    now: deps.now,
  })
}

function handleTransition(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const rawState = args[1]
  if (!rawState) {
    return { output: 'transition: missing required argument <STATE>', exitCode: EXIT_ERROR }
  }
  const parseResult = StateName.safeParse(rawState)
  if (!parseResult.success) {
    return { output: `transition: invalid state '${rawState}'`, exitCode: EXIT_ERROR }
  }
  return runTransition(deps.getSessionId(), parseResult.data, {
    readState: deps.readState,
    writeState: deps.writeState,
    getStateFilePath: deps.getStateFilePath,
    getGitInfo: deps.getGitInfo,
    checkPrChecks: deps.checkPrChecks,
    readFile: deps.readFile,
    getPluginRoot: deps.getPluginRoot,
    now: deps.now,
  })
}

function handleRecordIssue(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return { output: 'record-issue: missing required argument <number>', exitCode: EXIT_ERROR }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return { output: `record-issue: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  return runRecordIssue(deps.getSessionId(), issueNumber, stateDeps(deps))
}

function handleRecordBranch(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const branch = args[1]
  if (!branch) {
    return { output: 'record-branch: missing required argument <branch>', exitCode: EXIT_ERROR }
  }
  return runRecordBranch(deps.getSessionId(), branch, stateDeps(deps))
}

function handleRecordPlanApproval(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  return runRecordPlanApproval(deps.getSessionId(), stateDeps(deps))
}

function handleAssignIterationTask(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const task = args[1]
  if (!task) {
    return {
      output: 'assign-iteration-task: missing required argument <task>',
      exitCode: EXIT_ERROR,
    }
  }
  return runAssignIterationTask(deps.getSessionId(), task, stateDeps(deps))
}

function handleSignalDone(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  return runSignalDone(deps.getSessionId(), stateDeps(deps))
}

function handleRecordPr(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return { output: 'record-pr: missing required argument <number>', exitCode: EXIT_ERROR }
  }
  const prNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(prNumber)) {
    return { output: `record-pr: not a valid number: '${rawNumber}'`, exitCode: EXIT_ERROR }
  }
  return runRecordPr(deps.getSessionId(), prNumber, stateDeps(deps))
}

function handleCreatePr(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const title = args[1]
  const body = args[2]
  if (!title) {
    return { output: 'create-pr: missing required argument <title>', exitCode: EXIT_ERROR }
  }
  if (!body) {
    return { output: 'create-pr: missing required argument <body>', exitCode: EXIT_ERROR }
  }
  return runCreatePr(deps.getSessionId(), title, body, {
    ...stateDeps(deps),
    createDraftPr: deps.createDraftPr,
  })
}

function handleAppendIssueChecklist(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const rawNumber = args[1]
  const checklist = args[2]
  if (!rawNumber) {
    return {
      output: 'append-issue-checklist: missing required argument <issue-number>',
      exitCode: EXIT_ERROR,
    }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return {
      output: `append-issue-checklist: not a valid number: '${rawNumber}'`,
      exitCode: EXIT_ERROR,
    }
  }
  if (!checklist) {
    return {
      output: 'append-issue-checklist: missing required argument <checklist>',
      exitCode: EXIT_ERROR,
    }
  }
  return runAppendIssueChecklist(deps.getSessionId(), issueNumber, checklist, {
    ...stateDeps(deps),
    appendIssueChecklist: deps.appendIssueChecklist,
  })
}

function handleTickIteration(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const rawNumber = args[1]
  if (!rawNumber) {
    return {
      output: 'tick-iteration: missing required argument <issue-number>',
      exitCode: EXIT_ERROR,
    }
  }
  const issueNumber = Number.parseInt(rawNumber, 10)
  if (Number.isNaN(issueNumber)) {
    return {
      output: `tick-iteration: not a valid number: '${rawNumber}'`,
      exitCode: EXIT_ERROR,
    }
  }
  return runTickIteration(deps.getSessionId(), issueNumber, {
    ...stateDeps(deps),
    tickFirstUncheckedIteration: deps.tickFirstUncheckedIteration,
  })
}

function handleRunLint(args: readonly string[], deps: WorkflowDeps): OperationResult {
  return runLint(deps.getSessionId(), args.slice(1), {
    readState: deps.readState,
    writeState: deps.writeState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
    now: deps.now,
    runEslintOnFiles: deps.runEslintOnFiles,
    fileExists: deps.fileExists,
    getPluginRoot: deps.getPluginRoot,
  })
}

function handleBlockPluginReads(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  return runBlockPluginReads(hookInput, {
    getPluginRoot: deps.getPluginRoot,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
  })
}

function handleBlockWrites(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  return runBlockWrites(hookInput.session_id, hookInput, {
    readState: deps.readState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
  })
}

function handleBlockCommits(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  return runBlockCommits(hookInput.session_id, hookInput, {
    readState: deps.readState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
  })
}

function handleVerifyIdentity(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  return runVerifyIdentity(hookInput.session_id, hookInput, {
    readState: deps.readState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
    readTranscriptMessages: deps.readTranscriptMessages,
  })
}

function handleInjectState(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  return runInjectStateProcedure(hookInput.session_id, hookInput, {
    readState: deps.readState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
    readFile: deps.readFile,
    getPluginRoot: deps.getPluginRoot,
  })
}

function handleSubagentStart(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parseSubagentStartInput(deps.readStdin())
  return runInjectSubagentContext(hookInput.session_id, hookInput, {
    readState: deps.readState,
    writeState: deps.writeState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
    now: deps.now,
  })
}

function handleTeammateIdle(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parseTeammateIdleInput(deps.readStdin())
  return runEvaluateIdle(hookInput.session_id, hookInput, {
    readState: deps.readState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
  })
}

function handleShutDown(args: readonly string[], deps: WorkflowDeps): OperationResult {
  const agentName = args[1]
  if (!agentName) {
    return { output: 'shut-down: missing required argument <agent-name>', exitCode: EXIT_ERROR }
  }
  return runShutDown(deps.getSessionId(), agentName, {
    readState: deps.readState,
    writeState: deps.writeState,
    stateFileExists: deps.stateFileExists,
    getStateFilePath: deps.getStateFilePath,
    now: deps.now,
  })
}

function handlePersistSessionId(_args: readonly string[], deps: WorkflowDeps): OperationResult {
  const hookInput = parseCommonInput(deps.readStdin())
  return runPersistSessionId(hookInput.session_id, {
    getEnvFilePath: deps.getEnvFilePath,
    appendToFile: deps.appendToFile,
  })
}

/* v8 ignore start */
function buildRealDeps(): WorkflowDeps {
  return {
    readState,
    writeState,
    stateFileExists,
    getStateFilePath,
    getSessionId,
    getPluginRoot,
    getEnvFilePath,
    getGitInfo,
    checkPrChecks,
    createDraftPr,
    appendIssueChecklist,
    tickFirstUncheckedIteration,
    now: () => new Date().toISOString(),
    readFile: (path) => readFileSync(path, 'utf8'),
    readTranscriptMessages,
    fileExists: existsSync,
    runEslintOnFiles,
    appendToFile: (path, content) => appendFileSync(path, content),
    readStdin: readStdinSync,
  }
}

function main(): void {
  try {
    const result = runWorkflow(process.argv.slice(2), buildRealDeps())
    process.stdout.write(result.output, () => process.exit(result.exitCode))
  } catch (error) {
    const message = `[${new Date().toISOString()}] HOOK ERROR: ${String(error)}\n`
    process.stderr.write(message)
    appendFileSync('/tmp/feature-team-hook-errors.log', message)
    process.exit(EXIT_ERROR)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
/* v8 ignore stop */

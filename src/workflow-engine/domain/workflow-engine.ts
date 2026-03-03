import type { PreconditionResult } from '../../workflow-dsl/index.js'
import type { WorkflowState } from './workflow-state.js'
import type { AssistantMessage } from './identity-rules.js'
import { checkLeadIdentity } from './identity-rules.js'
import {
  formatTransitionSuccess,
  formatTransitionError,
  formatOperationGateError,
  formatOperationSuccess,
  formatInitSuccess,
} from './output-guidance.js'

export type EngineResult =
  | { readonly type: 'success'; readonly output: string }
  | { readonly type: 'blocked'; readonly output: string }
  | { readonly type: 'error'; readonly output: string }

export interface RehydratableWorkflow {
  getState(): WorkflowState
  getAgentInstructions(pluginRoot: string): string
  transitionTo(target: string): PreconditionResult
  registerAgent(agentType: string, agentId: string): PreconditionResult
  checkIdleAllowed(agentName: string): PreconditionResult
  shutDown(agentName: string): PreconditionResult
  runLint(files: readonly string[]): PreconditionResult
}

export type WorkflowDeps = {
  readonly getGitInfo: () => import('../../workflow-dsl/index.js').GitInfo
  readonly checkPrChecks: (prNumber: number) => boolean
  readonly createDraftPr: (title: string, body: string) => number
  readonly appendIssueChecklist: (issueNumber: number, checklist: string) => void
  readonly tickFirstUncheckedIteration: (issueNumber: number) => void
  readonly runEslintOnFiles: (configPath: string, files: readonly string[]) => boolean
  readonly fileExists: (path: string) => boolean
  readonly getPluginRoot: () => string
  readonly now: () => string
}

export interface WorkflowFactory<TWorkflow extends RehydratableWorkflow> {
  rehydrate(state: WorkflowState, deps: WorkflowDeps): TWorkflow
  procedurePath(state: string, pluginRoot: string): string
  initialState(): WorkflowState
  getEmojiForState(state: string): string
  getOperationBody(op: string, state: WorkflowState): string
  getTransitionTitle(to: string, state: WorkflowState): string
}

export type WorkflowEngineDeps = {
  readonly readState: (path: string) => WorkflowState
  readonly writeState: (path: string, state: WorkflowState) => void
  readonly stateFileExists: (path: string) => boolean
  readonly getStateFilePath: (sessionId: string) => string
  readonly getPluginRoot: () => string
  readonly getEnvFilePath: () => string
  readonly readFile: (path: string) => string
  readonly readTranscriptMessages: (path: string) => readonly AssistantMessage[]
  readonly appendToFile: (filePath: string, content: string) => void
  readonly now: () => string
}

const SUBAGENT_CMD = '/autonomous-claude-agent-team:workflow'

export class WorkflowEngine<TWorkflow extends RehydratableWorkflow> {
  private readonly factory: WorkflowFactory<TWorkflow>
  private readonly engineDeps: WorkflowEngineDeps
  private readonly workflowDeps: WorkflowDeps

  constructor(
    factory: WorkflowFactory<TWorkflow>,
    engineDeps: WorkflowEngineDeps,
    workflowDeps: WorkflowDeps,
  ) {
    this.factory = factory
    this.engineDeps = engineDeps
    this.workflowDeps = workflowDeps
  }

  startSession(sessionId: string, transcriptPath?: string): EngineResult {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    if (this.engineDeps.stateFileExists(statePath)) {
      return { type: 'success', output: '' }
    }
    const initial = this.factory.initialState()
    const state: WorkflowState = {
      ...initial,
      ...(transcriptPath === undefined ? {} : { transcriptPath }),
    }
    this.engineDeps.writeState(statePath, state)
    const procedurePath = this.factory.procedurePath(initial.state, this.engineDeps.getPluginRoot())
    const procedureContent = this.engineDeps.readFile(procedurePath)
    return { type: 'success', output: formatInitSuccess(procedureContent) }
  }

  transaction(
    sessionId: string,
    op: string,
    fn: (w: TWorkflow) => PreconditionResult,
  ): EngineResult {
    const workflow = this.rehydrate(sessionId)
    const result = fn(workflow)
    if (!result.pass) {
      return { type: 'blocked', output: formatOperationGateError(op, result.reason) }
    }
    this.persist(sessionId, workflow)
    const body = this.factory.getOperationBody(op, workflow.getState())
    return { type: 'success', output: formatOperationSuccess(op, body) }
  }

  transition(sessionId: string, target: string): EngineResult {
    const workflow = this.rehydrate(sessionId)
    const result = workflow.transitionTo(target)
    if (!result.pass) {
      const currentProcedure = this.readProcedure(workflow)
      return { type: 'blocked', output: formatTransitionError(target, result.reason, currentProcedure) }
    }
    this.persist(sessionId, workflow)
    const state = workflow.getState()
    const title = this.factory.getTransitionTitle(state.state, state)
    const procedure = this.readProcedure(workflow)
    return { type: 'success', output: formatTransitionSuccess(title, procedure) }
  }

  registerAgent(sessionId: string, agentType: string, agentId: string): EngineResult {
    const workflow = this.rehydrate(sessionId)
    workflow.registerAgent(agentType, agentId)
    this.persist(sessionId, workflow)
    const context = buildSubagentContext(workflow.getState())
    return { type: 'success', output: context }
  }

  checkIdleAllowed(sessionId: string, agentName: string): EngineResult {
    const workflow = this.rehydrate(sessionId)
    const result = workflow.checkIdleAllowed(agentName)
    if (!result.pass) {
      return { type: 'blocked', output: result.reason }
    }
    return { type: 'success', output: '' }
  }

  shutDown(sessionId: string, agentName: string): EngineResult {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    if (!this.engineDeps.stateFileExists(statePath)) {
      return { type: 'error', output: `shut-down: no state file for session '${sessionId}'` }
    }
    const workflow = this.rehydrate(sessionId)
    workflow.shutDown(agentName)
    this.persist(sessionId, workflow)
    const state = workflow.getState()
    return {
      type: 'success',
      output: `shut-down: agent '${agentName}' deregistered. Active agents: [${state.activeAgents.join(', ')}]`,
    }
  }

  runLint(sessionId: string, files: readonly string[]): EngineResult {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    if (!this.engineDeps.stateFileExists(statePath)) {
      return { type: 'success', output: 'run-lint: no state file. Run init first.' }
    }
    const workflow = this.rehydrate(sessionId)
    const result = workflow.runLint(files)
    if (!result.pass) {
      return { type: 'blocked', output: result.reason }
    }
    this.persist(sessionId, workflow)
    return { type: 'success', output: 'Lint passed.' }
  }

  persistSessionId(sessionId: string): void {
    const envFilePath = this.engineDeps.getEnvFilePath()
    this.engineDeps.appendToFile(envFilePath, `export CLAUDE_SESSION_ID='${sessionId}'\n`)
  }

  verifyIdentity(sessionId: string, transcriptPath: string): EngineResult {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    if (!this.engineDeps.stateFileExists(statePath)) {
      return { type: 'success', output: '' }
    }
    const state = this.engineDeps.readState(statePath)
    const messages = this.engineDeps.readTranscriptMessages(transcriptPath)
    const emoji = this.factory.getEmojiForState(state.state)
    const result = checkLeadIdentity(messages, state.state, emoji)

    if (result.status === 'lost') {
      const procedurePath = this.factory.procedurePath(state.state, this.engineDeps.getPluginRoot())
      const procedureContent = this.engineDeps.readFile(procedurePath)
      return { type: 'success', output: `${result.recoveryMessage}\n\n${procedureContent}` }
    }

    return { type: 'success', output: '' }
  }

  hasSession(sessionId: string): boolean {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    return this.engineDeps.stateFileExists(statePath)
  }

  private rehydrate(sessionId: string): TWorkflow {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    const state = this.engineDeps.readState(statePath)
    return this.factory.rehydrate(state, this.workflowDeps)
  }

  private persist(sessionId: string, workflow: TWorkflow): void {
    const statePath = this.engineDeps.getStateFilePath(sessionId)
    this.engineDeps.writeState(statePath, workflow.getState())
  }

  private readProcedure(workflow: TWorkflow): string {
    const path = workflow.getAgentInstructions(this.engineDeps.getPluginRoot())
    return this.engineDeps.readFile(path)
  }
}

function buildSubagentContext(state: WorkflowState): string {
  return (
    `Current workflow state: ${state.state}\n` +
    `Active agents: [${state.activeAgents.join(', ')}]\n\n` +
    `CLI commands:\n` +
    `  signal-done:  ${SUBAGENT_CMD} signal-done\n` +
    `  run-lint:     ${SUBAGENT_CMD} run-lint <files>\n` +
    `  record-pr:    ${SUBAGENT_CMD} record-pr <number>`
  )
}

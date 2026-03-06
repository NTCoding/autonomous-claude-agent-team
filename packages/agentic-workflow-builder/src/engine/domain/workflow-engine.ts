import type { PreconditionResult } from '../../dsl/index.js'
import type { BaseWorkflowState } from './workflow-state.js'
import { WorkflowStateError } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import {
  formatTransitionSuccess,
  formatTransitionError,
  formatOperationGateError,
  formatOperationSuccess,
  formatInitSuccess,
} from './output-guidance.js'
import type { TranscriptReader } from './transcript-reader.js'
import type { PrefixConfig } from './identity-verification.js'
import { checkIdentity } from './identity-verification.js'
import { ClaudeCodeTranscriptReader } from './claude-code-transcript-reader.js'

export type EngineResult =
  | { readonly type: 'success'; readonly output: string }
  | { readonly type: 'blocked'; readonly output: string }
  | { readonly type: 'error'; readonly output: string }

export interface RehydratableWorkflow<TState extends BaseWorkflowState> {
  getState(): TState
  getAgentInstructions(pluginRoot: string): string
  transitionTo(target: string): PreconditionResult
  getPendingEvents(): readonly BaseEvent[]
  startSession(transcriptPath: string | undefined, repository: string | undefined): void
}

export interface WorkflowFactory<TWorkflow extends RehydratableWorkflow<TState>, TState extends BaseWorkflowState, TDeps> {
  rehydrate(events: readonly BaseEvent[], deps: TDeps): TWorkflow
  createFresh(deps: TDeps): TWorkflow
  procedurePath(state: string, pluginRoot: string): string
  initialState(): TState
  getEmojiForState(state: string): string
  getOperationBody(op: string, state: TState): string
  getTransitionTitle(to: string, state: TState): string
  getPrefixConfig?(): PrefixConfig
}

export interface WorkflowEventStore {
  readEvents(sessionId: string): readonly BaseEvent[]
  appendEvents(sessionId: string, events: readonly BaseEvent[]): void
  sessionExists(sessionId: string): boolean
}

export type WorkflowEngineDeps = {
  readonly store: WorkflowEventStore
  readonly getPluginRoot: () => string
  readonly getEnvFilePath: () => string
  readonly readFile: (path: string) => string
  readonly appendToFile: (filePath: string, content: string) => void
  readonly now: () => string
  readonly transcriptReader?: TranscriptReader
}

export class WorkflowEngine<TWorkflow extends RehydratableWorkflow<TState>, TState extends BaseWorkflowState, TDeps> {
  private readonly factory: WorkflowFactory<TWorkflow, TState, TDeps>
  private readonly engineDeps: WorkflowEngineDeps
  private readonly workflowDeps: TDeps

  constructor(
    factory: WorkflowFactory<TWorkflow, TState, TDeps>,
    engineDeps: WorkflowEngineDeps,
    workflowDeps: TDeps,
  ) {
    this.factory = factory
    this.engineDeps = engineDeps
    this.workflowDeps = workflowDeps
  }

  startSession(sessionId: string, transcriptPath?: string, repository?: string): EngineResult {
    if (this.engineDeps.store.sessionExists(sessionId)) {
      return { type: 'success', output: '' }
    }
    const workflow = this.factory.createFresh(this.workflowDeps)
    workflow.startSession(transcriptPath, repository)
    this.engineDeps.store.appendEvents(sessionId, workflow.getPendingEvents())
    const initial = this.factory.initialState()
    const procedurePath = this.factory.procedurePath(initial.currentStateMachineState, this.engineDeps.getPluginRoot())
    const procedureContent = this.engineDeps.readFile(procedurePath)
    return { type: 'success', output: formatInitSuccess(procedureContent) }
  }

  transaction(
    sessionId: string,
    op: string,
    fn: (w: TWorkflow) => PreconditionResult,
    transcriptPath?: string,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const identityResult = this.verifyIdentity(sessionId, workflow, transcriptPath)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError(op, identityResult) }
    }
    const result = fn(workflow)
    this.persistEvents(sessionId, workflow)
    if (!result.pass) {
      return { type: 'blocked', output: formatOperationGateError(op, result.reason) }
    }
    const body = this.factory.getOperationBody(op, workflow.getState())
    return { type: 'success', output: formatOperationSuccess(op, body) }
  }

  transition(sessionId: string, target: string): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const result = workflow.transitionTo(target)
    if (!result.pass) {
      const currentProcedure = this.readProcedure(workflow)
      return { type: 'blocked', output: formatTransitionError(target, result.reason, currentProcedure) }
    }
    this.persistEvents(sessionId, workflow)
    const state = workflow.getState()
    const title = this.factory.getTransitionTitle(state.currentStateMachineState, state)
    const procedure = this.readProcedure(workflow)
    return { type: 'success', output: formatTransitionSuccess(title, procedure) }
  }

  persistSessionId(sessionId: string): void {
    const envFilePath = this.engineDeps.getEnvFilePath()
    this.engineDeps.appendToFile(envFilePath, `export CLAUDE_SESSION_ID='${sessionId}'\n`)
  }

  hasSession(sessionId: string): boolean {
    return this.engineDeps.store.sessionExists(sessionId)
  }

  private requireSession(sessionId: string): void {
    if (!this.engineDeps.store.sessionExists(sessionId)) {
      throw new WorkflowStateError(`No session found for '${sessionId}'. Run init first.`)
    }
  }

  private rehydrateFromEvents(sessionId: string): TWorkflow {
    const events = this.engineDeps.store.readEvents(sessionId)
    return this.factory.rehydrate(events, this.workflowDeps)
  }

  private persistEvents(sessionId: string, workflow: TWorkflow): void {
    const pending = workflow.getPendingEvents()
    if (pending.length > 0) {
      this.engineDeps.store.appendEvents(sessionId, pending)
    }
  }

  private verifyIdentity(sessionId: string, workflow: TWorkflow, transcriptPath: string | undefined): string | undefined {
    const prefixConfig = this.factory.getPrefixConfig?.()
    if (prefixConfig === undefined || transcriptPath === undefined) {
      return undefined
    }
    const reader = this.engineDeps.transcriptReader ?? new ClaudeCodeTranscriptReader()
    const messages = reader.readMessages(transcriptPath)
    const state = workflow.getState().currentStateMachineState
    const emoji = this.factory.getEmojiForState(state)
    const result = checkIdentity(messages, prefixConfig.pattern)
    const identityEvent = {
      type: 'identity-verified',
      at: this.engineDeps.now(),
      status: result.status,
      transcriptPath,
    }
    this.engineDeps.store.appendEvents(sessionId, [identityEvent])
    if (result.status === 'lost') {
      return prefixConfig.buildRecoveryMessage(state, emoji, this.engineDeps.getPluginRoot())
    }
    return undefined
  }

  private readProcedure(workflow: TWorkflow): string {
    const path = workflow.getAgentInstructions(this.engineDeps.getPluginRoot())
    return this.engineDeps.readFile(path)
  }
}

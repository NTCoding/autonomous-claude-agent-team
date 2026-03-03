import type { PreconditionResult } from '../../workflow-dsl/index.js'
import type { WorkflowState } from './workflow-state.js'
import { WorkflowStateError } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import type { AssistantMessage } from './identity-rules.js'
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
  getPendingEvents(): readonly BaseEvent[]
  verifyIdentity(transcriptPath: string): PreconditionResult
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
  readonly readTranscriptMessages: (path: string) => readonly AssistantMessage[]
}

export interface WorkflowFactory<TWorkflow extends RehydratableWorkflow> {
  rehydrate(events: readonly BaseEvent[], deps: WorkflowDeps): TWorkflow
  procedurePath(state: string, pluginRoot: string): string
  initialState(): WorkflowState
  getEmojiForState(state: string): string
  getOperationBody(op: string, state: WorkflowState): string
  getTransitionTitle(to: string, state: WorkflowState): string
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
}

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
    if (this.engineDeps.store.sessionExists(sessionId)) {
      return { type: 'success', output: '' }
    }
    const initial = this.factory.initialState()
    const sessionStartedEvent: BaseEvent = {
      type: 'session-started',
      at: this.engineDeps.now(),
      ...(transcriptPath === undefined ? {} : { transcriptPath }),
    }
    const events: BaseEvent[] = [sessionStartedEvent]
    this.engineDeps.store.appendEvents(sessionId, events)
    const procedurePath = this.factory.procedurePath(initial.state, this.engineDeps.getPluginRoot())
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
    if (transcriptPath !== undefined) {
      const identityCheck = workflow.verifyIdentity(transcriptPath)
      if (!identityCheck.pass) {
        this.persistEvents(sessionId, workflow)
        return { type: 'blocked', output: formatOperationGateError(op, identityCheck.reason) }
      }
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
    const title = this.factory.getTransitionTitle(state.state, state)
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

  private readProcedure(workflow: TWorkflow): string {
    const path = workflow.getAgentInstructions(this.engineDeps.getPluginRoot())
    return this.engineDeps.readFile(path)
  }
}

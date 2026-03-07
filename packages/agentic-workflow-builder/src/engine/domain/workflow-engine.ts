import type { PreconditionResult, WorkflowRegistry, TransitionContext, BashForbiddenConfig } from '../../dsl/index.js'
import { checkBashCommand } from '../../dsl/index.js'
import type { BaseWorkflowState } from './workflow-state.js'
import { WorkflowStateError } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import {
  formatTransitionSuccess,
  formatTransitionError,
  formatIllegalTransitionError,
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
  appendEvent(event: BaseEvent): void
  getPendingEvents(): readonly BaseEvent[]
  startSession(transcriptPath: string | undefined, repository: string | undefined): void
}

export interface WorkflowFactory<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> {
  rehydrate(events: readonly BaseEvent[], deps: TDeps): TWorkflow
  createFresh(deps: TDeps): TWorkflow
  procedurePath(state: TStateName, pluginRoot: string): string
  initialState(): TState
  getRegistry(): WorkflowRegistry<TState, TStateName, TOperation>
  buildTransitionContext(state: TState, from: TStateName, to: TStateName, deps: TDeps): TransitionContext<TState, TStateName>
  getOperationBody?(op: string, state: TState): string
  getTransitionTitle?(to: TStateName, state: TState): string
  buildTransitionEvent?(from: TStateName, to: TStateName, stateBefore: TState, stateAfter: TState, now: string): BaseEvent
  parseStateName(value: string): TStateName
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

export class WorkflowEngine<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> {
  private readonly factory: WorkflowFactory<TWorkflow, TState, TDeps, TStateName, TOperation>
  private readonly engineDeps: WorkflowEngineDeps
  private readonly workflowDeps: TDeps

  constructor(
    factory: WorkflowFactory<TWorkflow, TState, TDeps, TStateName, TOperation>,
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
    const body = this.factory.getOperationBody?.(op, workflow.getState()) ?? op
    return { type: 'success', output: formatOperationSuccess(op, body) }
  }

  transition(sessionId: string, target: TStateName): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const state = workflow.getState()
    const currentStateName = state.currentStateMachineState
    const registry = this.factory.getRegistry()
    const currentDef = registry[currentStateName]

    if (!currentDef.canTransitionTo.includes(target)) {
      const legalTargets = currentDef.canTransitionTo
      const reason = `Illegal transition ${currentStateName} -> ${target}. Legal targets from ${currentStateName}: [${legalTargets.join(', ') || 'none'}].`
      const currentProcedure = this.readProcedure(workflow)
      return { type: 'blocked', output: formatIllegalTransitionError(reason, currentProcedure) }
    }

    if (target !== 'BLOCKED' && currentDef.transitionGuard) {
      const ctx = this.factory.buildTransitionContext(state, currentStateName, target, this.workflowDeps)
      const guardResult = currentDef.transitionGuard(ctx)
      if (!guardResult.pass) {
        const currentProcedure = this.readProcedure(workflow)
        return { type: 'blocked', output: formatTransitionError(target, guardResult.reason, currentProcedure) }
      }
    }

    const targetDef = registry[target]
    const stateBefore = workflow.getState()
    const stateAfter = targetDef.onEntry
      ? targetDef.onEntry(stateBefore, this.factory.buildTransitionContext(stateBefore, currentStateName, target, this.workflowDeps))
      : stateBefore

    const transitionEvent = this.factory.buildTransitionEvent
      ? this.factory.buildTransitionEvent(currentStateName, target, stateBefore, stateAfter, this.engineDeps.now())
      : { type: 'transitioned', at: this.engineDeps.now(), from: currentStateName, to: target }

    workflow.appendEvent(transitionEvent)
    targetDef.afterEntry?.()
    this.persistEvents(sessionId, workflow)

    const newState = workflow.getState()
    const title = this.factory.getTransitionTitle?.(newState.currentStateMachineState, newState) ?? newState.currentStateMachineState
    const procedure = this.readProcedure(workflow)
    return { type: 'success', output: formatTransitionSuccess(title, procedure) }
  }

  checkBash(
    sessionId: string,
    toolName: string,
    command: string,
    bashForbidden: BashForbiddenConfig,
    transcriptPath?: string,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const identityResult = this.verifyIdentity(sessionId, workflow, transcriptPath)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('bash-check', identityResult) }
    }

    if (toolName !== 'Bash') {
      const allowedEvent = { type: 'bash-checked', at: this.engineDeps.now(), tool: toolName, command, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const registry = this.factory.getRegistry()
    const currentState = workflow.getState().currentStateMachineState
    const exemptions = registry[currentState].allowForbidden?.bash ?? []
    const result = checkBashCommand(command, bashForbidden, exemptions)

    if (!result.pass) {
      const reason = `Bash command blocked in ${currentState}. ${result.reason}`
      const deniedEvent = { type: 'bash-checked', at: this.engineDeps.now(), tool: toolName, command, allowed: false, reason }
      workflow.appendEvent(deniedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('bash-check', reason) }
    }

    const passedEvent = { type: 'bash-checked', at: this.engineDeps.now(), tool: toolName, command, allowed: true }
    workflow.appendEvent(passedEvent)
    this.persistEvents(sessionId, workflow)
    return { type: 'success', output: '' }
  }

  checkWrite(
    sessionId: string,
    toolName: string,
    filePath: string,
    isWriteAllowed: (toolName: string, filePath: string, state: TState) => PreconditionResult,
    transcriptPath?: string,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const identityResult = this.verifyIdentity(sessionId, workflow, transcriptPath)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('write-check', identityResult) }
    }

    const registry = this.factory.getRegistry()
    const currentState = workflow.getState().currentStateMachineState
    const isForbidden = registry[currentState].forbidden?.write ?? false

    if (!isForbidden) {
      const allowedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const result = isWriteAllowed(toolName, filePath, workflow.getState())
    if (!result.pass) {
      const deniedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: false, reason: result.reason }
      workflow.appendEvent(deniedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('write-check', result.reason) }
    }

    const passedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: true }
    workflow.appendEvent(passedEvent)
    this.persistEvents(sessionId, workflow)
    return { type: 'success', output: '' }
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
    const registry = this.factory.getRegistry()
    const emoji = registry[state].emoji
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

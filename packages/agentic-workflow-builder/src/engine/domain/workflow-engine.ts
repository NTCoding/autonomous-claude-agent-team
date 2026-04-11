import type { PreconditionResult, WorkflowRegistry, TransitionContext, BashForbiddenConfig } from '../../dsl/index.js'
import { checkBashCommand } from '../../dsl/index.js'
import type { BaseWorkflowState } from './workflow-state.js'
import { WorkflowStateError } from './workflow-state.js'
import type { BaseEvent } from './base-event.js'
import type { ZodType } from 'zod'
import {
  formatTransitionSuccess,
  formatTransitionError,
  formatIllegalTransitionError,
  formatOperationGateError,
  formatOperationSuccess,
  formatInitSuccess,
} from './output-guidance.js'
import type { TranscriptReader } from './transcript-reader.js'
import { checkIdentity } from './identity-verification.js'

export type EngineResult =
  | { readonly type: 'success'; readonly output: string }
  | { readonly type: 'blocked'; readonly output: string }
  | { readonly type: 'error'; readonly output: string }

export interface RehydratableWorkflow<TState extends BaseWorkflowState> {
  getState(): TState
  appendEvent(event: BaseEvent): void
  getPendingEvents(): readonly BaseEvent[]
  startSession(transcriptPath: string, repository: string | undefined): void
  getTranscriptPath(): string
  registerAgent(agentType: string, agentId: string): PreconditionResult
  handleTeammateIdle(agentName: string): PreconditionResult
}

export interface WorkflowDefinition<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> {
  fold(state: TState, event: BaseEvent): TState
  buildWorkflow(state: TState, deps: TDeps): TWorkflow
  stateSchema: ZodType<TStateName>
  initialState(): TState
  getRegistry(): WorkflowRegistry<TState, TStateName, TOperation>
  buildTransitionContext(state: TState, from: TStateName, to: TStateName, deps: TDeps): TransitionContext<TState, TStateName>
  getOperationBody?(op: string, state: TState): string
  getTransitionTitle?(to: TStateName, state: TState): string
  buildTransitionEvent?(from: TStateName, to: TStateName, stateBefore: TState, stateAfter: TState, now: string): BaseEvent
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
  readonly transcriptReader: TranscriptReader
}

export class WorkflowEngine<
  TWorkflow extends RehydratableWorkflow<TState>,
  TState extends BaseWorkflowState<TStateName>,
  TDeps,
  TStateName extends string = string,
  TOperation extends string = string,
> {
  private readonly factory: WorkflowDefinition<TWorkflow, TState, TDeps, TStateName, TOperation>
  private readonly engineDeps: WorkflowEngineDeps
  private readonly workflowDeps: TDeps

  constructor(
    factory: WorkflowDefinition<TWorkflow, TState, TDeps, TStateName, TOperation>,
    engineDeps: WorkflowEngineDeps,
    workflowDeps: TDeps,
  ) {
    this.factory = factory
    this.engineDeps = engineDeps
    this.workflowDeps = workflowDeps
  }

  startSession(sessionId: string, transcriptPath: string, repository?: string): EngineResult {
    if (this.engineDeps.store.sessionExists(sessionId)) {
      return { type: 'success', output: '' }
    }
    const initialState = this.factory.initialState()
    const workflow = this.factory.buildWorkflow(initialState, this.workflowDeps)
    workflow.startSession(transcriptPath, repository)
    this.engineDeps.store.appendEvents(sessionId, workflow.getPendingEvents())
    const procedureContent = this.engineDeps.readFile(this.buildProcedurePath(initialState.currentStateMachineState))
    const registry = this.factory.getRegistry()
    const expectedPrefix = this.getExpectedPrefix(initialState.currentStateMachineState, registry)
    return { type: 'success', output: formatInitSuccess(procedureContent, expectedPrefix) }
  }

  transaction(
    sessionId: string,
    op: string,
    fn: (w: TWorkflow) => PreconditionResult,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const registry = this.factory.getRegistry()
    const identityResult = this.verifyIdentity(sessionId, workflow)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      const currentPrefix = this.getExpectedPrefix(workflow.getState().currentStateMachineState, registry)
      return { type: 'blocked', output: formatOperationGateError(op, identityResult, currentPrefix) }
    }
    const result = fn(workflow)
    this.persistEvents(sessionId, workflow)
    const currentPrefix = this.getExpectedPrefix(workflow.getState().currentStateMachineState, registry)
    if (!result.pass) {
      return { type: 'blocked', output: formatOperationGateError(op, result.reason, currentPrefix) }
    }
    const body = this.factory.getOperationBody?.(op, workflow.getState()) ?? op
    return { type: 'success', output: formatOperationSuccess(op, body, currentPrefix) }
  }

  transition(sessionId: string, target: TStateName): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const state = workflow.getState()
    const currentStateName = state.currentStateMachineState
    const registry = this.factory.getRegistry()

    const identityResult = this.verifyIdentity(sessionId, workflow)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      const currentPrefix = this.getExpectedPrefix(currentStateName, registry)
      return { type: 'blocked', output: formatOperationGateError('transition', identityResult, currentPrefix) }
    }

    const currentDef = registry[currentStateName]
    if (!currentDef.canTransitionTo.includes(target)) {
      const legalTargets = currentDef.canTransitionTo
      const reason = `Illegal transition ${currentStateName} -> ${target}. Legal targets from ${currentStateName}: [${legalTargets.join(', ') || 'none'}].`
      const currentProcedure = this.readProcedure(workflow)
      const currentPrefix = this.getExpectedPrefix(currentStateName, registry)
      return { type: 'blocked', output: formatIllegalTransitionError(reason, currentProcedure, currentPrefix) }
    }

    if (target !== 'BLOCKED' && currentDef.transitionGuard) {
      const ctx = this.factory.buildTransitionContext(state, currentStateName, target, this.workflowDeps)
      const guardResult = currentDef.transitionGuard(ctx)
      if (!guardResult.pass) {
        const currentProcedure = this.readProcedure(workflow)
        const currentPrefix = this.getExpectedPrefix(currentStateName, registry)
        return { type: 'blocked', output: formatTransitionError(target, guardResult.reason, currentProcedure, currentPrefix) }
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
    const newPrefix = this.getExpectedPrefix(newState.currentStateMachineState, registry)
    return { type: 'success', output: formatTransitionSuccess(title, procedure, newPrefix) }
  }

  checkBash(
    sessionId: string,
    toolName: string,
    command: string,
    bashForbidden: BashForbiddenConfig,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const registry = this.factory.getRegistry()
    const currentStateName = workflow.getState().currentStateMachineState
    const currentPrefix = this.getExpectedPrefix(currentStateName, registry)

    const identityResult = this.verifyIdentity(sessionId, workflow)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('bash-check', identityResult, currentPrefix) }
    }

    if (toolName !== 'Bash') {
      const allowedEvent = { type: 'bash-checked', at: this.engineDeps.now(), tool: toolName, command, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const exemptions = registry[currentStateName].allowForbidden?.bash ?? []
    const result = checkBashCommand(command, bashForbidden, exemptions)

    if (!result.pass) {
      const reason = `Bash command blocked in ${currentStateName}. ${result.reason}`
      const deniedEvent = { type: 'bash-checked', at: this.engineDeps.now(), tool: toolName, command, allowed: false, reason }
      workflow.appendEvent(deniedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('bash-check', reason, currentPrefix) }
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
    isWriteAllowed: (filePath: string, state: TState) => boolean,
  ): EngineResult {
    this.requireSession(sessionId)
    const workflow = this.rehydrateFromEvents(sessionId)
    const registry = this.factory.getRegistry()
    const currentStateName = workflow.getState().currentStateMachineState
    const currentPrefix = this.getExpectedPrefix(currentStateName, registry)

    const identityResult = this.verifyIdentity(sessionId, workflow)
    if (identityResult !== undefined) {
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('write-check', identityResult, currentPrefix) }
    }

    const writeTools = new Set(['Write', 'Edit', 'NotebookEdit'])
    if (!writeTools.has(toolName)) {
      const allowedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const storePath = `${this.engineDeps.getPluginRoot()}/workflow.db`
    if (filePath === storePath) {
      const allowedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const isForbidden = registry[currentStateName].forbidden?.write ?? false
    if (!isForbidden) {
      const allowedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: true }
      workflow.appendEvent(allowedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'success', output: '' }
    }

    const allowed = isWriteAllowed(filePath, workflow.getState())
    if (!allowed) {
      const reason = `Write to '${filePath}' is forbidden in state ${currentStateName}`
      const deniedEvent = { type: 'write-checked', at: this.engineDeps.now(), tool: toolName, filePath, allowed: false, reason }
      workflow.appendEvent(deniedEvent)
      this.persistEvents(sessionId, workflow)
      return { type: 'blocked', output: formatOperationGateError('write-check', reason, currentPrefix) }
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
    const state = events.reduce<TState>(
      (acc, event) => this.factory.fold(acc, event),
      this.factory.initialState(),
    )
    return this.factory.buildWorkflow(state, this.workflowDeps)
  }

  private persistEvents(sessionId: string, workflow: TWorkflow): void {
    const pending = workflow.getPendingEvents()
    if (pending.length > 0) {
      this.engineDeps.store.appendEvents(sessionId, pending)
    }
  }

  private verifyIdentity(sessionId: string, workflow: TWorkflow): string | undefined {
    const transcriptPath = workflow.getTranscriptPath()
    const state = workflow.getState().currentStateMachineState
    const registry = this.factory.getRegistry()
    const emoji = registry[state].emoji
    const expectedPrefix = `${emoji} ${state}`
    const pattern = this.buildPrefixPattern(registry)
    const messages = this.engineDeps.transcriptReader.readMessages(transcriptPath)
    const result = checkIdentity(messages, pattern)
    const identityEvent = {
      type: 'identity-verified',
      at: this.engineDeps.now(),
      status: result.status,
      transcriptPath,
    }
    this.engineDeps.store.appendEvents(sessionId, [identityEvent])
    if (result.status === 'lost') {
      return `You forgot. Next message MUST begin with: ${expectedPrefix}`
    }
    return undefined
  }

  private buildPrefixPattern(registry: WorkflowRegistry<TState, TStateName, TOperation>): RegExp {
    const prefixes = (Object.keys(registry) as TStateName[]).map(
      (stateName) => `${registry[stateName].emoji} ${stateName}`,
    )
    return new RegExp(`^(${prefixes.join('|')})`)
  }

  private getExpectedPrefix(stateName: TStateName, registry: WorkflowRegistry<TState, TStateName, TOperation>): string {
    return `${registry[stateName].emoji} ${stateName}`
  }

  private readProcedure(workflow: TWorkflow): string {
    const path = this.buildProcedurePath(workflow.getState().currentStateMachineState)
    return this.engineDeps.readFile(path)
  }

  private buildProcedurePath(stateName: TStateName): string {
    return `${this.engineDeps.getPluginRoot()}/states/${String(stateName).toLowerCase()}.md`
  }
}

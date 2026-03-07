import type { PreconditionResult, GitInfo } from '@ntcoding/agentic-workflow-builder/dsl'
import { pass, fail, defineRecordingOps } from '@ntcoding/agentic-workflow-builder/dsl'
import { WorkflowStateError } from '@ntcoding/agentic-workflow-builder/engine'
import type { BaseEvent } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowState, StateName, WorkflowOperation } from './workflow-types.js'
import { getStateDefinition } from './registry.js'
import { WORKFLOW_REGISTRY } from './registry.js'
import { WorkflowStateSchema } from './workflow-types.js'
import type { WorkflowEvent } from './workflow-events.js'
import { WorkflowEventSchema } from './workflow-events.js'
import { applyEvent, EMPTY_STATE } from './fold.js'
import {
  READ_TOOLS,
  BASH_READ_PATTERN,
  isPluginSourcePath,
  checkLeadIdle,
  checkDeveloperIdle,
  checkOperationGate,
} from './workflow-predicates.js'

const RECORDING_OPS = defineRecordingOps<StateName, WorkflowState, WorkflowOperation>(WORKFLOW_REGISTRY, {
  'record-issue':          { event: 'issue-recorded',         payload: (n: number) => ({ issueNumber: n }) },
  'record-branch':         { event: 'branch-recorded',        payload: (b: string) => ({ branch: b }) },
  'record-plan-approval':  { event: 'plan-approval-recorded', payload: () => ({}) },
  'assign-iteration-task': { event: 'iteration-task-assigned', payload: (t: string) => ({ task: t }) },
  'record-pr':             { event: 'pr-recorded',            payload: (n: number) => ({ prNumber: n }) },
})

export type WorkflowDeps = {
  readonly getGitInfo: () => GitInfo
  readonly checkPrChecks: (prNumber: number) => boolean
  readonly createDraftPr: (title: string, body: string) => number
  readonly appendIssueChecklist: (issueNumber: number, checklist: string) => void
  readonly tickFirstUncheckedIteration: (issueNumber: number) => void
  readonly runEslintOnFiles: (configPath: string, files: readonly string[]) => boolean
  readonly fileExists: (path: string) => boolean
  readonly getPluginRoot: () => string
  readonly now: () => string
}

export class Workflow {
  private state: WorkflowState
  private readonly deps: WorkflowDeps
  private pendingEvents: WorkflowEvent[] = []

  private constructor(state: WorkflowState, deps: WorkflowDeps) {
    this.state = state
    this.deps = deps
  }

  static createFresh(deps: WorkflowDeps): Workflow {
    return new Workflow(EMPTY_STATE, deps)
  }

  static rehydrate(state: WorkflowState, deps: WorkflowDeps): Workflow {
    return new Workflow(WorkflowStateSchema.parse(state), deps)
  }

  static procedurePath(state: StateName, pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(state).agentInstructions}`
  }

  getPendingEvents(): readonly WorkflowEvent[] {
    return this.pendingEvents
  }

  appendEvent(event: BaseEvent): void {
    const workflowEvent = WorkflowEventSchema.parse(event)
    this.pendingEvents = [...this.pendingEvents, workflowEvent]
    this.state = applyEvent(this.state, workflowEvent)
  }

  private append(event: WorkflowEvent): void {
    this.pendingEvents = [...this.pendingEvents, event]
    this.state = applyEvent(this.state, event)
  }

  getState(): WorkflowState {
    return this.state
  }

  getAgentInstructions(pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(this.state.currentStateMachineState).agentInstructions}`
  }

  startSession(transcriptPath: string | undefined, repository: string | undefined): void {
    this.append({ type: 'session-started', at: this.deps.now(), ...(transcriptPath === undefined ? {} : { transcriptPath }), ...(repository === undefined ? {} : { repository }) })
  }

  executeRecording(op: WorkflowOperation, ...args: readonly unknown[]): PreconditionResult {
    const result = RECORDING_OPS.executeOp(op, this.state, this.deps.now(), args)
    if (!result.pass) return fail(result.reason)
    const parsed = WorkflowEventSchema.parse(result.event)
    this.append(parsed)
    return pass()
  }

  signalDone(): PreconditionResult {
    const gate = checkOperationGate('signal-done', this.state)
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration entry at index ${this.state.iteration}`)
    }

    this.append({ type: 'developer-done-signaled', at: this.deps.now() })
    return pass()
  }

  createPr(title: string, body: string): PreconditionResult {
    const gate = checkOperationGate('create-pr', this.state)
    if (!gate.pass) return gate
    const prNumber = this.deps.createDraftPr(title, body)
    this.append({ type: 'pr-created', at: this.deps.now(), prNumber })
    return pass()
  }

  appendIssueChecklist(issueNumber: number, checklist: string): PreconditionResult {
    const gate = checkOperationGate('append-issue-checklist', this.state)
    if (!gate.pass) return gate
    this.deps.appendIssueChecklist(issueNumber, checklist)
    this.append({ type: 'issue-checklist-appended', at: this.deps.now(), issueNumber })
    return pass()
  }

  tickIteration(issueNumber: number): PreconditionResult {
    const gate = checkOperationGate('tick-iteration', this.state)
    if (!gate.pass) return gate
    this.deps.tickFirstUncheckedIteration(issueNumber)
    this.append({ type: 'iteration-ticked', at: this.deps.now(), issueNumber })
    return pass()
  }

  reviewApproved(): PreconditionResult {
    const gate = checkOperationGate('review-approved', this.state)
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.append({ type: 'review-approved', at: this.deps.now() })
    return pass()
  }

  reviewRejected(): PreconditionResult {
    const gate = checkOperationGate('review-rejected', this.state)
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.append({ type: 'review-rejected', at: this.deps.now() })
    return pass()
  }

  coderabbitFeedbackAddressed(): PreconditionResult {
    const gate = checkOperationGate('coderabbit-feedback-addressed', this.state)
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.append({ type: 'coderabbit-addressed', at: this.deps.now() })
    return pass()
  }

  coderabbitFeedbackIgnored(): PreconditionResult {
    const gate = checkOperationGate('coderabbit-feedback-ignored', this.state)
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.append({ type: 'coderabbit-ignored', at: this.deps.now() })
    return pass()
  }

  runLint(files: readonly string[]): PreconditionResult {
    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration entry at index ${this.state.iteration}`)
    }

    const tsFiles = files.filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && this.deps.fileExists(f))

    if (tsFiles.length === 0) {
      this.append({ type: 'lint-ran', at: this.deps.now(), files: 0, passed: true })
      return pass()
    }

    const configPath = `${this.deps.getPluginRoot()}/lint/eslint.config.mjs`
    const passed = this.deps.runEslintOnFiles(configPath, tsFiles)

    if (!passed) {
      return fail('Lint failed. Fix all violations before proceeding.')
    }

    this.append({ type: 'lint-ran', at: this.deps.now(), files: tsFiles.length, passed: true, lintedFiles: tsFiles })
    return pass()
  }

  checkPluginSourceRead(toolName: string, filePath: string, command: string): PreconditionResult {
    const pluginRoot = this.deps.getPluginRoot()

    if (READ_TOOLS.has(toolName) && isPluginSourcePath(filePath, pluginRoot)) {
      const reason = 'Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.'
      this.append({ type: 'plugin-read-checked', at: this.deps.now(), tool: toolName, path: filePath, allowed: false, reason })
      return fail(reason)
    }

    if (toolName === 'Bash' && BASH_READ_PATTERN.test(command) && isPluginSourcePath(command, pluginRoot)) {
      const reason = 'Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.'
      this.append({ type: 'plugin-read-checked', at: this.deps.now(), tool: toolName, path: command, allowed: false, reason })
      return fail(reason)
    }

    this.append({ type: 'plugin-read-checked', at: this.deps.now(), tool: toolName, path: filePath || command, allowed: true })
    return pass()
  }

  checkIdleAllowed(agentName: string): PreconditionResult {
    const result = this.resolveIdleResult(agentName)
    this.append({
      type: 'idle-checked',
      at: this.deps.now(),
      agentName,
      allowed: result.pass,
      reason: result.pass ? undefined : result.reason,
    })
    return result
  }

  private resolveIdleResult(agentName: string): PreconditionResult {
    if (agentName.includes('lead')) {
      return checkLeadIdle(this.state)
    }
    if (agentName.includes('developer')) {
      return checkDeveloperIdle(this.state)
    }
    return pass()
  }

  shutDown(agentName: string): PreconditionResult {
    this.append({ type: 'agent-shut-down', at: this.deps.now(), agentName })
    return pass()
  }

  registerAgent(agentType: string, agentId: string): PreconditionResult {
    this.append({ type: 'agent-registered', at: this.deps.now(), agentType, agentId })
    return pass()
  }

  writeJournal(agentName: string, content: string): PreconditionResult {
    if (!content) return fail('write-journal: content cannot be empty')
    this.append({ type: 'journal-entry', at: this.deps.now(), agentName, content })
    return pass()
  }

  requestContext(agentName: string): PreconditionResult {
    this.append({ type: 'context-requested', at: this.deps.now(), agentName })
    return pass()
  }

  getSessionSummary(agentName: string): PreconditionResult {
    this.append({ type: 'context-requested', at: this.deps.now(), agentName })
    return pass()
  }

}


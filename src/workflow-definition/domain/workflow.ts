import type { PreconditionResult, TransitionContext, GitInfo } from '../../workflow-dsl/index.js'
import { pass, fail } from '../../workflow-dsl/index.js'
import type { WorkflowState } from '../../workflow-engine/index.js'
import { WorkflowStateError } from '../../workflow-engine/index.js'
import type { AssistantMessage } from '../../workflow-engine/index.js'
import { checkLeadIdentity } from '../../workflow-engine/index.js'
import { WORKFLOW_REGISTRY, getStateDefinition } from './registry.js'
import type { StateName } from './workflow-types.js'
import { parseStateName, WorkflowStateSchema, STATE_EMOJI_MAP } from './workflow-types.js'
import type { WorkflowEvent } from './workflow-events.js'
import { applyEvent } from './fold.js'
import {
  COMMIT_BLOCKED_STATES,
  FILE_WRITING_TOOLS,
  READ_TOOLS,
  BASH_READ_PATTERN,
  GLOBAL_FORBIDDEN,
  isStateFile,
  isPluginSourcePath,
  checkLeadIdle,
  checkDeveloperIdle,
  checkOperationGate,
} from './workflow-predicates.js'

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
  readonly readTranscriptMessages: (path: string) => readonly AssistantMessage[]
}

export class Workflow {
  private state: WorkflowState
  private readonly deps: WorkflowDeps
  private pendingEvents: WorkflowEvent[] = []

  private constructor(state: WorkflowState, deps: WorkflowDeps) {
    this.state = state
    this.deps = deps
  }

  static rehydrate(state: WorkflowState, deps: WorkflowDeps): Workflow {
    return new Workflow(WorkflowStateSchema.parse(state), deps)
  }

  static procedurePath(state: string, pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(state).agentInstructions}`
  }

  getPendingEvents(): readonly WorkflowEvent[] {
    return this.pendingEvents
  }

  private append(event: WorkflowEvent): void {
    this.pendingEvents = [...this.pendingEvents, event]
    this.state = applyEvent(this.state, event)
  }

  getState(): WorkflowState {
    return this.state
  }

  getAgentInstructions(pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(this.state.state).agentInstructions}`
  }

  recordIssue(issueNumber: number): PreconditionResult {
    const gate = checkOperationGate('record-issue', this.state)
    if (!gate.pass) return gate
    this.append({ type: 'issue-recorded', at: this.deps.now(), issueNumber })
    return pass()
  }

  recordBranch(branch: string): PreconditionResult {
    const gate = checkOperationGate('record-branch', this.state)
    if (!gate.pass) return gate
    this.append({ type: 'branch-recorded', at: this.deps.now(), branch })
    return pass()
  }

  recordPlanApproval(): PreconditionResult {
    const gate = checkOperationGate('record-plan-approval', this.state)
    if (!gate.pass) return gate
    this.append({ type: 'plan-approval-recorded', at: this.deps.now() })
    return pass()
  }

  assignIterationTask(task: string): PreconditionResult {
    const gate = checkOperationGate('assign-iteration-task', this.state)
    if (!gate.pass) return gate
    this.append({ type: 'iteration-task-assigned', at: this.deps.now(), task })
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

  recordPr(prNumber: number): PreconditionResult {
    const gate = checkOperationGate('record-pr', this.state)
    if (!gate.pass) return gate
    this.append({ type: 'pr-recorded', at: this.deps.now(), prNumber })
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

  checkWriteAllowed(toolName: string, filePath: string): PreconditionResult {
    const currentDef = getStateDefinition(this.state.state)
    if (!currentDef.forbidden?.write) {
      this.append({ type: 'write-checked', at: this.deps.now(), tool: toolName, filePath, allowed: true })
      return pass()
    }

    if (!FILE_WRITING_TOOLS.has(toolName)) {
      this.append({ type: 'write-checked', at: this.deps.now(), tool: toolName, filePath, allowed: true })
      return pass()
    }

    if (isStateFile(filePath)) {
      this.append({ type: 'write-checked', at: this.deps.now(), tool: toolName, filePath, allowed: true })
      return pass()
    }

    const reason = `Write operation '${toolName}' is forbidden in state: ${this.state.state}`
    this.append({ type: 'write-checked', at: this.deps.now(), tool: toolName, filePath, allowed: false, reason })
    return fail(reason)
  }

  checkBashAllowed(toolName: string, command: string): PreconditionResult {
    if (toolName !== 'Bash') {
      this.append({ type: 'bash-checked', at: this.deps.now(), tool: toolName, command, allowed: true })
      return pass()
    }

    const currentDef = getStateDefinition(this.state.state)

    for (const pattern of GLOBAL_FORBIDDEN.bashPatterns) {
      if (!pattern.test(command)) {
        continue
      }

      const allowed = currentDef.allowForbidden?.bash ?? []
      const isExempt = allowed.some((cmd) => command.includes(cmd))
      if (isExempt) {
        continue
      }

      if (currentDef.forbidden?.write) {
        const reason = `git commit/push blocked during ${this.state.state}.\n\nNo commits during ${this.state.state}. Wait for the lead to transition out of ${this.state.state}.`
        this.append({ type: 'bash-checked', at: this.deps.now(), tool: toolName, command, allowed: false, reason })
        return fail(reason)
      }

      if (COMMIT_BLOCKED_STATES.has(this.state.state)) {
        const reason = `Cannot commit during ${this.state.state}.\n\nCommits are blocked until the reviewer approves changes. Developer must signal completion first, then the lead transitions to REVIEWING.`
        this.append({ type: 'bash-checked', at: this.deps.now(), tool: toolName, command, allowed: false, reason })
        return fail(reason)
      }
    }

    this.append({ type: 'bash-checked', at: this.deps.now(), tool: toolName, command, allowed: true })
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

  verifyIdentity(transcriptPath: string): PreconditionResult {
    const messages = this.deps.readTranscriptMessages(transcriptPath)
    /* v8 ignore next */
    const emoji = STATE_EMOJI_MAP[this.state.state] ?? ''
    const result = checkLeadIdentity(messages, this.state.state, emoji)
    this.append({ type: 'identity-verified', at: this.deps.now(), status: result.status, transcriptPath })
    if (result.status === 'lost') return fail(result.recoveryMessage)
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

  transitionTo(target: string): PreconditionResult {
    const from = parseStateName(this.state.state)
    const targetState = parseStateName(target)

    const currentDef = WORKFLOW_REGISTRY[from]
    if (!currentDef.canTransitionTo.includes(targetState)) {
      return fail(`Illegal transition ${from} -> ${targetState}. Legal targets from ${from}: [${currentDef.canTransitionTo.join(', ') || 'none'}].`)
    }

    if (targetState !== 'BLOCKED' && currentDef.transitionGuard) {
      const ctx = this.buildTransitionContext(from, targetState)
      const guardResult = currentDef.transitionGuard(ctx)
      if (!guardResult.pass) return guardResult
    }

    const targetDef = WORKFLOW_REGISTRY[targetState]
    const base = targetDef.onEntry ? targetDef.onEntry(this.state, this.buildTransitionContext(from, targetState)) : this.state

    // Build fat event fields from onEntry result
    const iterationChanged = base.iteration !== this.state.iteration
    const developingHeadCommit = targetState === 'DEVELOPING'
      ? base.iterations[base.iteration]?.developingHeadCommit
      : undefined

    this.append({
      type: 'transitioned',
      at: this.deps.now(),
      from,
      to: targetState,
      ...(iterationChanged ? { iteration: base.iteration } : {}),
      ...(developingHeadCommit === undefined ? {} : { developingHeadCommit }),
    })

    return pass()
  }

  private buildTransitionContext(from: StateName, to: StateName): TransitionContext<WorkflowState, StateName> {
    const prChecksPass = (to === 'COMPLETE' || to === 'FEEDBACK') && this.state.prNumber !== undefined
      ? this.deps.checkPrChecks(this.state.prNumber)
      : false
    return { state: this.state, gitInfo: this.deps.getGitInfo(), prChecksPass, from, to }
  }
}


import type { PreconditionResult, TransitionContext, GitInfo } from '../../workflow-dsl/index.js'
import { pass, fail } from '../../workflow-dsl/index.js'
import type { WorkflowState, IterationState } from '../../workflow-engine/index.js'
import { WorkflowStateError, createEventEntry } from '../../workflow-engine/index.js'
import { WORKFLOW_REGISTRY, GLOBAL_FORBIDDEN, getStateDefinition } from './registry.js'
import type { StateName, WorkflowOperation } from './workflow-types.js'
import { parseStateName, WorkflowStateSchema } from './workflow-types.js'

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

  getState(): WorkflowState {
    return this.state
  }

  getAgentInstructions(pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(this.state.state).agentInstructions}`
  }

  recordIssue(issueNumber: number): PreconditionResult {
    const gate = this.checkOperationGate('record-issue')
    if (!gate.pass) return gate

    this.state = {
      ...this.state,
      githubIssue: issueNumber,
      eventLog: [...this.state.eventLog, createEventEntry('record-issue', this.deps.now(), { issueNumber })],
    }
    return pass()
  }

  recordBranch(branch: string): PreconditionResult {
    const gate = this.checkOperationGate('record-branch')
    if (!gate.pass) return gate

    this.state = {
      ...this.state,
      featureBranch: branch,
      eventLog: [...this.state.eventLog, createEventEntry('record-branch', this.deps.now(), { branch })],
    }
    return pass()
  }

  recordPlanApproval(): PreconditionResult {
    const gate = this.checkOperationGate('record-plan-approval')
    if (!gate.pass) return gate

    this.state = {
      ...this.state,
      userApprovedPlan: true,
      eventLog: [...this.state.eventLog, createEventEntry('record-plan-approval', this.deps.now())],
    }
    return pass()
  }

  assignIterationTask(task: string): PreconditionResult {
    const gate = this.checkOperationGate('assign-iteration-task')
    if (!gate.pass) return gate

    const newIteration: IterationState = {
      task,
      developerDone: false,
      reviewApproved: false,
      reviewRejected: false,
      coderabbitFeedbackAddressed: false,
      coderabbitFeedbackIgnored: false,
      lintedFiles: [],
      lintRanIteration: false,
    }

    this.state = {
      ...this.state,
      iterations: [...this.state.iterations, newIteration],
      eventLog: [...this.state.eventLog, createEventEntry('assign-iteration-task', this.deps.now(), { task })],
    }
    return pass()
  }

  signalDone(): PreconditionResult {
    const gate = this.checkOperationGate('signal-done')
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration entry at index ${this.state.iteration}`)
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration ? { ...iter, developerDone: true } : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('signal-done', this.deps.now())],
    }
    return pass()
  }

  recordPr(prNumber: number): PreconditionResult {
    const gate = this.checkOperationGate('record-pr')
    if (!gate.pass) return gate

    this.state = {
      ...this.state,
      prNumber,
      eventLog: [...this.state.eventLog, createEventEntry('record-pr', this.deps.now(), { prNumber })],
    }
    return pass()
  }

  createPr(title: string, body: string): PreconditionResult {
    const gate = this.checkOperationGate('create-pr')
    if (!gate.pass) return gate

    const prNumber = this.deps.createDraftPr(title, body)

    this.state = {
      ...this.state,
      prNumber,
      eventLog: [...this.state.eventLog, createEventEntry('create-pr', this.deps.now(), { prNumber })],
    }
    return pass()
  }

  appendIssueChecklist(issueNumber: number, checklist: string): PreconditionResult {
    const gate = this.checkOperationGate('append-issue-checklist')
    if (!gate.pass) return gate

    this.deps.appendIssueChecklist(issueNumber, checklist)

    this.state = {
      ...this.state,
      eventLog: [...this.state.eventLog, createEventEntry('append-issue-checklist', this.deps.now(), { issueNumber })],
    }
    return pass()
  }

  tickIteration(issueNumber: number): PreconditionResult {
    const gate = this.checkOperationGate('tick-iteration')
    if (!gate.pass) return gate

    this.deps.tickFirstUncheckedIteration(issueNumber)

    this.state = {
      ...this.state,
      eventLog: [...this.state.eventLog, createEventEntry('tick-iteration', this.deps.now(), { issueNumber })],
    }
    return pass()
  }

  reviewApproved(): PreconditionResult {
    const gate = this.checkOperationGate('review-approved')
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration ? { ...iter, reviewApproved: true } : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('review-approved', this.deps.now())],
    }
    return pass()
  }

  reviewRejected(): PreconditionResult {
    const gate = this.checkOperationGate('review-rejected')
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration ? { ...iter, reviewRejected: true } : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('review-rejected', this.deps.now())],
    }
    return pass()
  }

  coderabbitFeedbackAddressed(): PreconditionResult {
    const gate = this.checkOperationGate('coderabbit-feedback-addressed')
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration ? { ...iter, coderabbitFeedbackAddressed: true } : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('coderabbit-feedback-addressed', this.deps.now())],
    }
    return pass()
  }

  coderabbitFeedbackIgnored(): PreconditionResult {
    const gate = this.checkOperationGate('coderabbit-feedback-ignored')
    if (!gate.pass) return gate

    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration at index ${this.state.iteration}`)
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration ? { ...iter, coderabbitFeedbackIgnored: true } : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('coderabbit-feedback-ignored', this.deps.now())],
    }
    return pass()
  }

  runLint(files: readonly string[]): PreconditionResult {
    const currentIteration = this.state.iterations[this.state.iteration]
    if (!currentIteration) {
      throw new WorkflowStateError(`No iteration entry at index ${this.state.iteration}`)
    }

    const tsFiles = files.filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && this.deps.fileExists(f))

    if (tsFiles.length === 0) {
      this.state = {
        ...this.state,
        iterations: this.state.iterations.map((iter, i) =>
          i === this.state.iteration ? { ...iter, lintRanIteration: true } : iter
        ),
        eventLog: [...this.state.eventLog, createEventEntry('run-lint', this.deps.now(), { files: 0, passed: true })],
      }
      return pass()
    }

    const configPath = `${this.deps.getPluginRoot()}/lint/eslint.config.mjs`
    const passed = this.deps.runEslintOnFiles(configPath, tsFiles)

    if (!passed) {
      return fail('Lint failed. Fix all violations before proceeding.')
    }

    this.state = {
      ...this.state,
      iterations: this.state.iterations.map((iter, i) =>
        i === this.state.iteration
          ? {
              ...iter,
              lintRanIteration: true,
              lintedFiles: [...new Set([...iter.lintedFiles, ...tsFiles])],
            }
          : iter
      ),
      eventLog: [...this.state.eventLog, createEventEntry('run-lint', this.deps.now(), { files: tsFiles.length, passed: true })],
    }
    return pass()
  }

  checkWriteAllowed(toolName: string, filePath: string): PreconditionResult {
    const currentDef = getStateDefinition(this.state.state)
    if (!currentDef.forbidden?.write) {
      return pass()
    }

    if (!FILE_WRITING_TOOLS.has(toolName)) {
      return pass()
    }

    if (isStateFile(filePath)) {
      return pass()
    }

    return fail(`Write operation '${toolName}' is forbidden in state: ${this.state.state}`)
  }

  checkBashAllowed(toolName: string, command: string): PreconditionResult {
    if (toolName !== 'Bash') {
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
        return fail(
          `git commit/push blocked during ${this.state.state}.\n\nNo commits during ${this.state.state}. Wait for the lead to transition out of ${this.state.state}.`,
        )
      }

      if (COMMIT_BLOCKED_STATES.has(this.state.state)) {
        return fail(
          `Cannot commit during ${this.state.state}.\n\nCommits are blocked until the reviewer approves changes. Developer must signal completion first, then the lead transitions to REVIEWING.`,
        )
      }
    }

    return pass()
  }

  checkPluginSourceRead(toolName: string, filePath: string, command: string): PreconditionResult {
    const pluginRoot = this.deps.getPluginRoot()

    if (READ_TOOLS.has(toolName) && isPluginSourcePath(filePath, pluginRoot)) {
      return fail('Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.')
    }

    if (toolName === 'Bash' && BASH_READ_PATTERN.test(command) && isPluginSourcePath(command, pluginRoot)) {
      return fail('Reading plugin source code is not allowed. The plugin is a black box. Follow the checklist from the last command output.')
    }

    return pass()
  }

  checkIdleAllowed(agentName: string): PreconditionResult {
    if (agentName.includes('lead')) {
      return this.checkLeadIdle()
    }

    if (agentName.includes('developer')) {
      return this.checkDeveloperIdle()
    }

    return pass()
  }

  shutDown(agentName: string): PreconditionResult {
    const idx = this.state.activeAgents.indexOf(agentName)
    const updatedAgents =
      idx === -1
        ? this.state.activeAgents
        : [...this.state.activeAgents.slice(0, idx), ...this.state.activeAgents.slice(idx + 1)]

    this.state = {
      ...this.state,
      activeAgents: updatedAgents,
      eventLog: [...this.state.eventLog, createEventEntry('shut-down', this.deps.now(), { agent: agentName })],
    }
    return pass()
  }

  registerAgent(agentType: string, agentId: string): PreconditionResult {
    const alreadyRegistered = this.state.activeAgents.includes(agentType)
    this.state = {
      ...this.state,
      activeAgents: alreadyRegistered ? this.state.activeAgents : [...this.state.activeAgents, agentType],
      eventLog: [
        ...this.state.eventLog,
        createEventEntry('subagent-start', this.deps.now(), { agent: agentType, agentId }),
      ],
    }
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

    this.state = {
      ...base,
      state: targetState,
      eventLog: [...base.eventLog, createEventEntry('transition', this.deps.now(), { from, to: targetState })],
    }

    return pass()
  }

  private checkLeadIdle(): PreconditionResult {
    const LEAD_IDLE_ALLOWED: ReadonlySet<string> = new Set(['BLOCKED', 'COMPLETE'])
    if (LEAD_IDLE_ALLOWED.has(this.state.state)) {
      return pass()
    }
    const allowedStates = [...LEAD_IDLE_ALLOWED].join(' or ')
    return fail(`Lead cannot go idle in ${this.state.state} state. Transition to ${allowedStates} before stopping, or continue working.`)
  }

  private checkDeveloperIdle(): PreconditionResult {
    if (this.state.state !== 'DEVELOPING') {
      return pass()
    }
    const currentIteration = this.state.iterations[this.state.iteration]
    if (currentIteration?.developerDone) {
      return pass()
    }
    return fail(
      `Developer cannot go idle in ${this.state.state} without signalling done. Run lint on all changed files, fix all violations, then run signal-done. Follow the workflow checklist in your agent instructions.`,
    )
  }

  private checkOperationGate(op: WorkflowOperation): PreconditionResult {
    const currentDef = getStateDefinition(this.state.state)
    if (currentDef.allowedWorkflowOperations.includes(op)) {
      return pass()
    }
    return fail(`${op} is not allowed in state ${this.state.state}.`)
  }

  private buildTransitionContext(from: StateName, to: StateName): TransitionContext<WorkflowState, StateName> {
    return {
      state: this.state,
      gitInfo: this.deps.getGitInfo(),
      prChecksPass: this.determinePrChecksPass(to),
      from,
      to,
    }
  }

  private determinePrChecksPass(target: StateName): boolean {
    if ((target === 'COMPLETE' || target === 'FEEDBACK') && this.state.prNumber !== undefined) {
      return this.deps.checkPrChecks(this.state.prNumber)
    }
    return false
  }
}

const COMMIT_BLOCKED_STATES: ReadonlySet<string> = new Set(['DEVELOPING', 'REVIEWING'])
const FILE_WRITING_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'NotebookEdit'])
const READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep'])
const BASH_READ_PATTERN = /\b(?:cat|head|tail|less|more|grep|rg|find|ls)\b/

function isStateFile(filePath: string): boolean {
  return filePath.includes('feature-team-state-') && filePath.endsWith('.json')
}

function isPluginSourcePath(text: string, pluginRoot: string): boolean {
  if (!GLOBAL_FORBIDDEN.pluginSourcePattern.test(text)) {
    return false
  }
  const agentsMdPattern = new RegExp(`${escapeRegExp(pluginRoot)}/agents/`)
  if (agentsMdPattern.test(text)) {
    return false
  }
  return true
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

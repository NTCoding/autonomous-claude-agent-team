import { z } from 'zod'
import type { WorkflowStateDefinition, WorkflowRegistry } from '../../workflow-dsl/index.js'
import type { WorkflowState } from '../../workflow-engine/index.js'
import { createWorkflowStateSchema } from '../../workflow-engine/index.js'

export const STATE_NAMES = [
  'SPAWN',
  'PLANNING',
  'RESPAWN',
  'DEVELOPING',
  'REVIEWING',
  'COMMITTING',
  'CR_REVIEW',
  'PR_CREATION',
  'FEEDBACK',
  'BLOCKED',
  'COMPLETE',
] as const

export type StateName = (typeof STATE_NAMES)[number]

export const StateNameSchema = z.enum(STATE_NAMES)

export const WorkflowStateSchema = createWorkflowStateSchema(STATE_NAMES)

export type WorkflowOperation =
  | 'record-issue'
  | 'record-branch'
  | 'record-plan-approval'
  | 'assign-iteration-task'
  | 'signal-done'
  | 'record-pr'
  | 'create-pr'
  | 'append-issue-checklist'
  | 'tick-iteration'
  | 'review-approved'
  | 'review-rejected'
  | 'coderabbit-feedback-addressed'
  | 'coderabbit-feedback-ignored'

export type ForbiddenBashCommand = 'git commit' | 'git push' | 'git checkout'

export type ConcreteStateDefinition = WorkflowStateDefinition<WorkflowState, StateName, WorkflowOperation, ForbiddenBashCommand>

export type ConcreteRegistry = WorkflowRegistry<WorkflowState, StateName, WorkflowOperation, ForbiddenBashCommand>

export const INITIAL_STATE: WorkflowState = {
  state: 'SPAWN',
  iteration: 0,
  iterations: [],
  userApprovedPlan: false,
  activeAgents: [],
}

export function parseStateName(value: string): StateName {
  return StateNameSchema.parse(value)
}

export const STATE_EMOJI_MAP: Readonly<Record<string, string | undefined>> = {
  SPAWN: '🟣',
  PLANNING: '⚪',
  RESPAWN: '🔄',
  DEVELOPING: '🔨',
  REVIEWING: '📋',
  COMMITTING: '💾',
  CR_REVIEW: '🐰',
  PR_CREATION: '🚀',
  FEEDBACK: '💬',
  BLOCKED: '⚠️',
  COMPLETE: '✅',
} satisfies Readonly<Record<StateName, string>>

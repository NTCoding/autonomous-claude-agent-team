import type { ConcreteRegistry, ConcreteStateDefinition } from './workflow-types.js'
import { parseStateName } from './workflow-types.js'
import { spawnState } from './states/spawn/spawn.js'
import { planningState } from './states/planning/planning.js'
import { respawnState } from './states/respawn/respawn.js'
import { developingState } from './states/developing/developing.js'
import { reviewingState } from './states/reviewing/reviewing.js'
import { committingState } from './states/committing/committing.js'
import { crReviewState } from './states/cr-review/cr-review.js'
import { prCreationState } from './states/pr-creation/pr-creation.js'
import { feedbackState } from './states/feedback/feedback.js'
import { blockedState } from './states/blocked/blocked.js'
import { completeState } from './states/complete/complete.js'

export const GLOBAL_FORBIDDEN = {
  bashPatterns: [/(?:^|\s|&&|;)git\s+(?:commit|push)(?:\s|$|-|;|&)/, /(?:^|\s|&&|;)git\s+checkout(?:\s|$|-|;|&)/] as const,
  pluginSourcePattern: /\.claude\/plugins\/cache\//,
} as const

export function getStateDefinition(state: string): ConcreteStateDefinition {
  return WORKFLOW_REGISTRY[parseStateName(state)]
}

export const WORKFLOW_REGISTRY: ConcreteRegistry = {
  SPAWN: spawnState,
  PLANNING: planningState,
  RESPAWN: respawnState,
  DEVELOPING: developingState,
  REVIEWING: reviewingState,
  COMMITTING: committingState,
  CR_REVIEW: crReviewState,
  PR_CREATION: prCreationState,
  FEEDBACK: feedbackState,
  BLOCKED: blockedState,
  COMPLETE: completeState,
}

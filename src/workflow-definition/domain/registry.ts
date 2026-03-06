import type { BashForbiddenConfig } from '@ntcoding/agentic-workflow-builder/dsl'
import type { ConcreteRegistry, ConcreteStateDefinition } from './workflow-types.js'
import { parseStateName } from './workflow-types.js'
import { spawnState } from './states/spawn.js'
import { planningState } from './states/planning.js'
import { respawnState } from './states/respawn.js'
import { developingState } from './states/developing.js'
import { reviewingState } from './states/reviewing.js'
import { committingState } from './states/committing.js'
import { crReviewState } from './states/cr-review.js'
import { prCreationState } from './states/pr-creation.js'
import { feedbackState } from './states/feedback.js'
import { blockedState } from './states/blocked.js'
import { completeState } from './states/complete.js'

export const BASH_FORBIDDEN: BashForbiddenConfig = {
  patterns: [
    /(?:^|\s|&&|;)git\s+(?:commit|push)(?:\s|$|-|;|&)/,
    /(?:^|\s|&&|;)git\s+checkout(?:\s|$|-|;|&)/,
  ],
}

export const PLUGIN_SOURCE_PATTERN = /\.claude\/plugins\/cache\//

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

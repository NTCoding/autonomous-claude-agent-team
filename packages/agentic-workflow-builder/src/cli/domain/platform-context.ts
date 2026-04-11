import type { WorkflowEventStore } from '../../engine/index'

export type PlatformContext = {
  readonly getPluginRoot: () => string
  readonly now: () => string
  readonly getSessionId: () => string
  readonly store: WorkflowEventStore
}

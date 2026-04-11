import type { PreconditionResult } from '../../dsl/index'
import type { ArgParser } from './arg-helpers'

type RouteHandler<TWorkflow> = (workflow: TWorkflow, ...parsedArgs: readonly unknown[]) => PreconditionResult

type TransactionRoute<TWorkflow> = {
  readonly type: 'transaction'
  readonly args?: readonly ArgParser<unknown>[]
  readonly handler: RouteHandler<TWorkflow>
}

type TransitionRoute = {
  readonly type: 'transition'
  readonly args?: readonly ArgParser<unknown>[]
}

type SessionStartRoute = {
  readonly type: 'session-start'
  readonly args?: readonly ArgParser<unknown>[]
}

export type RouteDefinition<TWorkflow, TState> =
  | TransactionRoute<TWorkflow>
  | TransitionRoute
  | SessionStartRoute

export type RouteMap<TWorkflow, TState> = Record<string, RouteDefinition<TWorkflow, TState>>

export function defineRoutes<TWorkflow, TState>(
  routes: RouteMap<TWorkflow, TState>,
): RouteMap<TWorkflow, TState> {
  return routes
}

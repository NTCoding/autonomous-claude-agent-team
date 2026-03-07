import type { PreconditionResult } from '../../dsl/index.js'
import type { ArgParser } from './arg-helpers.js'

type CommandHandler<TWorkflow> = (workflow: TWorkflow, ...parsedArgs: readonly unknown[]) => PreconditionResult

type TransactionCommand<TWorkflow> = {
  readonly type: 'transaction'
  readonly args?: readonly ArgParser<unknown>[]
  readonly handler: CommandHandler<TWorkflow>
}

type TransitionCommand = {
  readonly type: 'transition'
  readonly args?: readonly ArgParser<unknown>[]
}

type SessionStartCommand = {
  readonly type: 'session-start'
  readonly args?: readonly ArgParser<unknown>[]
}

export type CommandDefinition<TWorkflow, TState> =
  | TransactionCommand<TWorkflow>
  | TransitionCommand
  | SessionStartCommand

export type CommandMap<TWorkflow, TState> = Record<string, CommandDefinition<TWorkflow, TState>>

export function defineCommands<TWorkflow, TState>(
  commands: CommandMap<TWorkflow, TState>,
): CommandMap<TWorkflow, TState> {
  return commands
}

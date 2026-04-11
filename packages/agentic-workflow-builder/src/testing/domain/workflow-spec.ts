import type { SpecConfig, GivenPhase, WorkflowSpecification } from './types'

export class WorkflowSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowSpecError'
  }
}

const EMPTY_OVERRIDES = Object.freeze({})

export function workflowSpec<TEvent, TState, TDeps, TWorkflow>(
  config: SpecConfig<TEvent, TState, TDeps, TWorkflow>,
): WorkflowSpecification<TEvent, TState, TDeps, TWorkflow> {
  function buildGiven(
    events: readonly TEvent[],
    depOverrides: Partial<TDeps>,
  ): GivenPhase<TEvent, TState, TDeps, TWorkflow> {
    const resolveDeps = (): TDeps => config.mergeDeps(config.defaultDeps(), depOverrides)

    const rehydrate = (): TWorkflow => {
      const state = config.fold(events)
      return config.rehydrate(state, resolveDeps())
    }

    return {
      withDeps: (overrides) =>
        buildGiven(events, { ...depOverrides, ...overrides }),

      when: (op) => {
        const wf = rehydrate()
        const result = op(wf)
        return {
          result,
          events: config.getPendingEvents(wf),
          state: config.getState(wf),
        }
      },

      whenThrows: (op) => {
        const wf = rehydrate()
        try {
          op(wf)
        } catch (error: unknown) {
          return { error }
        }
        throw new WorkflowSpecError('Expected operation to throw, but it did not')
      },
    }
  }

  return {
    given: (...events) => buildGiven(events, EMPTY_OVERRIDES),
  }
}

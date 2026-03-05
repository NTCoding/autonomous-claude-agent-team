import { workflowSpec, WorkflowSpecError } from './workflow-spec.js'

type ToyEvent =
  | { readonly type: 'incremented'; readonly by: number }
  | { readonly type: 'named'; readonly name: string }

type ToyState = { readonly count: number; readonly name: string }
type ToyDeps = { readonly multiplier: number; readonly prefix: string }

class ToyWorkflow {
  private state: ToyState
  private readonly deps: ToyDeps
  private pending: ToyEvent[] = []

  constructor(state: ToyState, deps: ToyDeps) {
    this.state = state
    this.deps = deps
  }

  getState(): ToyState {
    return this.state
  }

  getPendingEvents(): readonly ToyEvent[] {
    return this.pending
  }

  increment(): string {
    const event: ToyEvent = { type: 'incremented', by: this.deps.multiplier }
    this.pending = [...this.pending, event]
    this.state = { ...this.state, count: this.state.count + this.deps.multiplier }
    return `incremented to ${this.state.count}`
  }

  rename(newName: string): void {
    const event: ToyEvent = { type: 'named', name: `${this.deps.prefix}${newName}` }
    this.pending = [...this.pending, event]
    this.state = { ...this.state, name: `${this.deps.prefix}${newName}` }
  }

  failOp(): void {
    throw new WorkflowSpecError('intentional failure')
  }
}

function toyFold(events: readonly ToyEvent[]): ToyState {
  return events.reduce<ToyState>(
    (state, event) => {
      switch (event.type) {
        case 'incremented':
          return { ...state, count: state.count + event.by }
        case 'named':
          return { ...state, name: event.name }
      }
    },
    { count: 0, name: '' },
  )
}

const spec = workflowSpec<ToyEvent, ToyState, ToyDeps, ToyWorkflow>({
  fold: toyFold,
  rehydrate: (state, deps) => new ToyWorkflow(state, deps),
  defaultDeps: () => ({ multiplier: 1, prefix: '' }),
  getPendingEvents: (wf) => wf.getPendingEvents(),
  getState: (wf) => wf.getState(),
  mergeDeps: (defaults, overrides) => ({ ...defaults, ...overrides }),
})

describe('workflowSpec', () => {
  describe('given with no events', () => {
    it('starts from empty state', () => {
      const { state } = spec.given().when((wf) => wf.getState())
      expect(state).toStrictEqual({ count: 0, name: '' })
    })
  })

  describe('given with events', () => {
    it('folds events into state before operation', () => {
      const { state } = spec
        .given({ type: 'incremented', by: 3 }, { type: 'incremented', by: 7 })
        .when((wf) => wf.getState())
      expect(state.count).toBe(10)
    })

    it('folds named event', () => {
      const { state } = spec
        .given({ type: 'named', name: 'hello' })
        .when((wf) => wf.getState())
      expect(state.name).toBe('hello')
    })
  })

  describe('when', () => {
    it('returns operation result', () => {
      const { result } = spec.given().when((wf) => wf.increment())
      expect(result).toBe('incremented to 1')
    })

    it('returns pending events from operation', () => {
      const { events } = spec.given().when((wf) => wf.increment())
      expect(events).toStrictEqual([{ type: 'incremented', by: 1 }])
    })

    it('returns state after operation', () => {
      const { state } = spec.given().when((wf) => wf.increment())
      expect(state).toStrictEqual({ count: 1, name: '' })
    })

    it('handles void operations', () => {
      const { result, events } = spec.given().when((wf) => wf.rename('test'))
      expect(result).toBeUndefined()
      expect(events).toStrictEqual([{ type: 'named', name: 'test' }])
    })

    it('combines folded state with operation effects', () => {
      const { state, events } = spec
        .given({ type: 'incremented', by: 5 })
        .when((wf) => wf.increment())
      expect(state.count).toBe(6)
      expect(events).toStrictEqual([{ type: 'incremented', by: 1 }])
    })
  })

  describe('withDeps', () => {
    it('overrides default deps', () => {
      const { state } = spec
        .given()
        .withDeps({ multiplier: 10 })
        .when((wf) => wf.increment())
      expect(state.count).toBe(10)
    })

    it('chains multiple overrides', () => {
      const { state, events } = spec
        .given()
        .withDeps({ multiplier: 5 })
        .withDeps({ prefix: 'pre-' })
        .when((wf) => {
          wf.increment()
          wf.rename('x')
          return undefined
        })
      expect(state.count).toBe(5)
      expect(state.name).toBe('pre-x')
      expect(events).toHaveLength(2)
    })

    it('later overrides win', () => {
      const { state } = spec
        .given()
        .withDeps({ multiplier: 5 })
        .withDeps({ multiplier: 99 })
        .when((wf) => wf.increment())
      expect(state.count).toBe(99)
    })

    it('preserves previous overrides when adding new keys', () => {
      const { state } = spec
        .given()
        .withDeps({ multiplier: 7 })
        .withDeps({ prefix: 'hi-' })
        .when((wf) => {
          wf.increment()
          return wf.getState()
        })
      expect(state.count).toBe(7)
    })
  })

  describe('whenThrows', () => {
    it('captures thrown error', () => {
      const { error } = spec.given().whenThrows((wf) => wf.failOp())
      expect(error).toBeInstanceOf(WorkflowSpecError)
      expect(error).toHaveProperty('message', 'intentional failure')
    })

    it('throws if operation does not throw', () => {
      expect(() =>
        spec.given().whenThrows((wf) => wf.increment()),
      ).toThrow('Expected operation to throw, but it did not')
    })
  })

  describe('mergeDeps', () => {
    it('is invoked with defaults and overrides', () => {
      const mergeSpy = vi.fn(
        (defaults: ToyDeps, overrides: Partial<ToyDeps>): ToyDeps => ({
          ...defaults,
          ...overrides,
        }),
      )

      const customSpec = workflowSpec<ToyEvent, ToyState, ToyDeps, ToyWorkflow>({
        fold: toyFold,
        rehydrate: (state, deps) => new ToyWorkflow(state, deps),
        defaultDeps: () => ({ multiplier: 1, prefix: '' }),
        getPendingEvents: (wf) => wf.getPendingEvents(),
        getState: (wf) => wf.getState(),
        mergeDeps: mergeSpy,
      })

      customSpec.given().withDeps({ multiplier: 42 }).when((wf) => wf.increment())

      expect(mergeSpy).toHaveBeenCalledWith(
        { multiplier: 1, prefix: '' },
        { multiplier: 42 },
      )
    })
  })
})

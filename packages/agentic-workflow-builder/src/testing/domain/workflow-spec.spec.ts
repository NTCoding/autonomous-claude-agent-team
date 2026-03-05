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

const EMPTY_STATE: ToyState = { count: 0, name: '' }

function fold(events: readonly ToyEvent[]): ToyState {
  return events.reduce<ToyState>((state, event) => {
    switch (event.type) {
      case 'incremented': return { ...state, count: state.count + event.by }
      case 'named': return { ...state, name: event.name }
    }
  }, EMPTY_STATE)
}

const DEFAULT_DEPS: ToyDeps = { multiplier: 1, prefix: '' }

const spec = workflowSpec<ToyEvent, ToyState, ToyDeps, ToyWorkflow>({
  fold,
  rehydrate: (state, deps) => new ToyWorkflow(state, deps),
  defaultDeps: () => ({ ...DEFAULT_DEPS }),
  getPendingEvents: (wf) => wf.getPendingEvents(),
  getState: (wf) => wf.getState(),
  mergeDeps: (defaults, overrides) => ({ ...defaults, ...overrides }),
})

describe('workflowSpec — given/when', () => {
  it('returns result from the operation', () => {
    const { result } = spec.given().when((wf) => wf.increment())
    expect(result).toStrictEqual('incremented to 1')
  })

  it('returns pending events after the operation', () => {
    const { events } = spec.given().when((wf) => wf.increment())
    expect(events).toStrictEqual([{ type: 'incremented', by: 1 }])
  })

  it('returns state after the operation', () => {
    const { state } = spec.given().when((wf) => wf.increment())
    expect(state).toStrictEqual({ count: 1, name: '' })
  })

  it('rehydrates from given events before operating', () => {
    const { state } = spec
      .given({ type: 'incremented', by: 5 })
      .when((wf) => wf.increment())
    expect(state.count).toStrictEqual(6)
  })

  it('supports multiple given events', () => {
    const { state } = spec
      .given(
        { type: 'incremented', by: 3 },
        { type: 'incremented', by: 7 },
      )
      .when((wf) => wf.increment())
    expect(state.count).toStrictEqual(11)
  })
})

describe('workflowSpec — withDeps', () => {
  it('overrides default deps for the operation', () => {
    const { state } = spec
      .given()
      .withDeps({ multiplier: 10 })
      .when((wf) => wf.increment())
    expect(state.count).toStrictEqual(10)
  })

  it('merges multiple withDeps calls', () => {
    const { state } = spec
      .given()
      .withDeps({ multiplier: 5 })
      .withDeps({ prefix: 'test-' })
      .when((wf) => {
        wf.increment()
        wf.rename('foo')
        return undefined
      })
    expect(state.count).toStrictEqual(5)
    expect(state.name).toStrictEqual('test-foo')
  })
})

describe('workflowSpec — whenThrows', () => {
  it('captures thrown error', () => {
    const { error } = spec.given().whenThrows((wf) => wf.failOp())
    expect(error).toBeInstanceOf(WorkflowSpecError)
  })

  it('throws WorkflowSpecError when operation does not throw', () => {
    expect(() => spec.given().whenThrows((wf) => wf.increment()))
      .toThrow('Expected operation to throw, but it did not')
  })
})

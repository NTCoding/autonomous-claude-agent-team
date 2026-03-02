# Testing Strategy

## Coverage

100% coverage enforced for all metrics (statements, branches, functions, lines). No exceptions.

## The Rule: Test Through Public Methods Only

**Never test internals directly.** All `workflow-definition` tests go through the public methods on `Workflow` — the single aggregate root. State definitions, the registry, guards, onEntry hooks — none of these have their own tests. They are exercised indirectly through `Workflow.rehydrate()` + public method calls.

This is non-negotiable. The internal structure of `workflow-definition/domain/` (registry, state files, guard functions) is an implementation detail. Tests that reach into internals couple to structure, not behavior, and break on every refactor.

### What "black box" means here

Tests know:
- `Workflow.rehydrate(state, deps)` — construct from a given state
- Public methods: `transitionTo()`, `recordIssue()`, `signalDone()`, `checkWriteAllowed()`, `checkBashAllowed()`, etc.
- `getState()` — inspect the result

Tests don't know:
- Which file defines the SPAWN state
- How the registry maps states to definitions
- How guards are structured internally
- Which onEntry hook runs during a transition

## Workflow Test Examples

### Testing a state transition (guard pass + fail)

```typescript
it('transitions to PLANNING when issue set and agents present', () => {
  const state = stateWith({
    githubIssue: 1,
    activeAgents: ['developer-1', 'reviewer-1'],
  })
  const wf = Workflow.rehydrate(state, makeDeps())
  const result = wf.transitionTo('PLANNING')
  expect(result).toStrictEqual({ pass: true })
  expect(wf.getState().state).toBe('PLANNING')
})

it('fails transition to PLANNING when no githubIssue', () => {
  const state = stateWith({
    activeAgents: ['developer-1', 'reviewer-1'],
  })
  const wf = Workflow.rehydrate(state, makeDeps())
  const result = wf.transitionTo('PLANNING')
  expect(result.pass).toBe(false)
})
```

### Testing an operation (allowed + disallowed states)

```typescript
it('sets githubIssue when recordIssue succeeds', () => {
  const wf = Workflow.rehydrate(INITIAL_STATE, makeDeps())
  const result = wf.recordIssue(42)
  expect(result).toStrictEqual({ pass: true })
  expect(wf.getState().githubIssue).toBe(42)
})

it('fails recordIssue in non-SPAWN states', () => {
  const state = stateWith({ state: 'PLANNING' })
  const wf = Workflow.rehydrate(state, makeDeps())
  const result = wf.recordIssue(42)
  expect(result.pass).toBe(false)
})
```

### Testing hook checks (permission enforcement)

```typescript
it('blocks writes in RESPAWN state', () => {
  const state = stateWith({ state: 'RESPAWN' })
  const wf = Workflow.rehydrate(state, makeDeps())
  expect(wf.checkWriteAllowed('Write', '/some/file.ts').pass).toBe(false)
})

it('blocks git commit in DEVELOPING state', () => {
  const state = stateWith({ state: 'DEVELOPING', iterations: [DEFAULT_ITERATION] })
  const wf = Workflow.rehydrate(state, makeDeps())
  expect(wf.checkBashAllowed('Bash', 'git commit -m "foo"').pass).toBe(false)
})
```

### Testing with dependency overrides

```typescript
it('fails transition to RESPAWN when dirty tree', () => {
  const state = stateWith({ state: 'PLANNING', userApprovedPlan: true })
  const wf = Workflow.rehydrate(state, makeDeps({ getGitInfo: () => dirtyGit }))
  const result = wf.transitionTo('RESPAWN')
  expect(result.pass).toBe(false)
})
```

## Test Helpers

### `stateWith()` — construct a specific workflow state

```typescript
function stateWith(overrides: Partial<WorkflowState>): WorkflowState {
  return { ...INITIAL_STATE, ...overrides }
}
```

### `makeDeps()` — inject dependencies with sensible defaults

```typescript
function makeDeps(overrides?: Partial<WorkflowDeps>): WorkflowDeps {
  return {
    getGitInfo: () => cleanGit,
    checkPrChecks: () => true,
    createDraftPr: () => 99,
    // ... sensible defaults for all deps
    ...overrides,
  }
}
```

Override only what the test cares about. Everything else uses safe defaults.

## Other Test Surfaces

### WorkflowEngine (`workflow-engine/domain/workflow-engine.spec.ts`)

Tests the generic load → invoke → save cycle using stub workflows. Verifies that the engine correctly delegates to the workflow, persists state, and formats output. Uses `StubWorkflow` and `FailingWorkflow` test doubles — not the real `Workflow` class.

### Entrypoint (`autonomous-claude-agent-team-workflow.spec.ts`)

Tests the thin adapter: command routing, argument validation, hook parsing, exit code mapping. Uses `AdapterDeps` injection — no filesystem or network I/O.

### Infra (`infra/*.spec.ts`)

Tests I/O adapters (filesystem, git, GitHub, stdin, linter) in isolation.

## Array Assertions

**Never assert collection length.** `toHaveLength(N)` is a proxy for correctness — it breaks when unrelated entries are added and tells you nothing about what the array actually contains.

Validate contents instead:

```typescript
// ❌ Avoid
expect(wf.getState().eventLog).toHaveLength(1)

// ✅ Prefer — assert what matters, not how many
expect(wf.getState().eventLog).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ op: 'recordIssue', detail: { githubIssue: 42 } }),
  ])
)
```

When exact sequence matters, assert on specific indices or `toStrictEqual` the full array. Use length only as a secondary assertion when the count itself is the behavior under test.

## What We Don't Test

- `buildRealDeps()` and `main()` — marked `/* v8 ignore */`, pure wiring
- Node.js builtins (fs, process) — tested through the dependency injection boundary

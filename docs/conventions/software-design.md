# Software Design Conventions

## SD-001: Fail fast over silent fallbacks

```typescript
// ✗ silent
value ?? backup ?? 'unknown'

// ✓ explicit
if (!value) throw new WorkflowError(`Expected value. Got undefined. Context: ${ctx}`)
```

Error format: `Expected [X]. Got [Y]. Context: [debugging info]`

## SD-002: No `any` type

TypeScript's type system exists to catch bugs. `any` defeats it.

## SD-003: No `as` type assertions (except `as const`)

Type assertions hide bugs. Use type guards and Zod `.parse()` instead.

## SD-004: No `let` declarations

Immutable by default. Mutation causes bugs.

## SD-005: Inject dependencies, don't instantiate

```typescript
// ✗ tight coupling
function doWork() { const git = new GitClient() }

// ✓ loose coupling
function doWork(git: GitClient) { ... }
```

## SD-006: Domain never does I/O

Domain functions take inputs, return outputs. No file reads, no shell-outs.

## SD-007: Intention-revealing names

Never: `data`, `utils`, `helpers`, `handler`, `processor`, `manager`, `service`.
Use domain language: `WorkflowState`, `transitionPreconditions`, `signalDone`.

## SD-008: No code comments

Comments are failures to express intent in code. Refactor instead.

## SD-009: No generic Error

```typescript
// ✗ generic
throw new Error('something went wrong')

// ✓ specific
throw new WorkflowStateError(`Cannot read state file: ${path}`)
```

## SD-010: Use Zod for runtime validation

Parse external data at boundaries. Type inference from schemas keeps types in sync.

## SD-011: Make illegal states unrepresentable

Use discriminated unions. If a state combination shouldn't exist, forbid it in types.

## SD-012: Small entities

Classes < 150 lines. Methods < 10 lines. Functions < 10 lines.

## SD-013: One level of indentation per method (target)

Early returns instead of deep nesting. Max depth: 3.

## SD-014: No else keyword when if returns

```typescript
// ✗ unnecessary else
if (x) { return a } else { return b }

// ✓ early return
if (x) return a
return b
```

## SD-015: First-class collections

A class with a collection contains nothing else meaningful.

## SD-016: Wrap primitives and strings as value objects

Domain concepts like `SessionId`, `FeatureBranch`, `IterationNumber` deserve types.
N/A for this project (enforced at Zod schema boundaries instead).

## SD-017: Feature envy detection

Method uses another object's data more than its own? Move it there.

## SD-018: YAGNI — You Aren't Gonna Need It

Build for current requirements only. No speculative generalization.

## SD-019: Prefer immutability

Return new values instead of mutating. Spread instead of assignment.

## SD-020: No getters/setters on entities

Tell, don't ask. Objects should do work, not expose data.

## SD-021: Separation of concerns

- `operations/` — orchestration (load, validate, apply, persist, output)
- `domain/` — pure logic (no I/O)
- `infra/` — all I/O

## SD-022: Single entry point

All operations route through `dist/workflow.js`. No direct state file access.

## SD-023: Operations describe workflow, not CRUD

`signal-done` not `update-field`. `record-issue` not `set-github-issue`.

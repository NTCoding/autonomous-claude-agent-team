# Workflow DSL: State Definition Files

## Problem

To understand "what does DEVELOPING do?", you read 5 files.

## Goal

Each state is one file. Open `developing.ts` — you immediately understand the state.

## Principles

1. **Each state owns its completeness** — a state's transition guard verifies its own obligations were met. No state checks another state's work.
2. **Observability and debuggability are first-class concerns** — every significant action is recorded in state. If it happened, the state proves it happened. The event log is the audit trail.
3. **Type-safe, compile-time safe** — invalid state names, operations, and transitions fail at compile time.
4. **Testable** — pure functions, no I/O in definitions, dependency injection preserved.
5. **Code guides, agents follow** — don't rely on agents to remember instructions. Inject `agentInstructions` on every state transition and whenever a workflow command fails. The agent's context window is unreliable — the code must re-teach the agent what to do at every decision point.

## States

```typescript
type StateName = 'SPAWN' | 'PLANNING' | 'RESPAWN' | 'DEVELOPING'
  | 'REVIEWING' | 'COMMITTING' | 'CR_REVIEW' | 'PR_CREATION'
  | 'FEEDBACK' | 'BLOCKED' | 'COMPLETE'
```

Already defined as a Zod enum — no change needed.

## The Type

```typescript
type WorkflowOperation = 'record-issue' | 'record-branch' | 'record-plan-approval'
  | 'assign-iteration-task' | 'signal-done' | 'record-pr' | 'create-pr'
  | 'append-issue-checklist' | 'tick-iteration'
  | 'review-approved' | 'review-rejected'
  | 'coderabbit-feedback-addressed' | 'coderabbit-feedback-ignored'

type ForbiddenBashCommand = 'git commit' | 'git push' | 'git checkout'

type TransitionContext = {
  readonly state: WorkflowState
  readonly gitInfo: GitInfo
  readonly from: StateName
  readonly to: StateName
}

type WorkflowStateDefinition = {
  readonly emoji: string
  readonly agentInstructions: string
  readonly canTransitionTo: readonly StateName[]
  readonly allowedWorkflowOperations: readonly WorkflowOperation[]
  readonly forbidden?: {
    readonly write?: boolean
  }
  readonly allowForbidden?: {
    readonly bash?: readonly ForbiddenBashCommand[]
  }
  readonly transitionGuard?: (ctx: TransitionContext) => PreconditionResult
  readonly onEntry?: (state: WorkflowState, ctx: TransitionContext) => WorkflowState
}
```

## Global Forbidden Rules

Defined on the registry, not on individual states. Always active unless a state declares `allowForbidden`.

```typescript
globalForbidden: {
  bash: ['git commit', 'git push', 'git checkout'],
  read: ['${PLUGIN_ROOT}/src/**'],
}
```

- `git commit/push` — only allowed in COMMITTING
- `git checkout` — only allowed in PLANNING
- Plugin source reads — banned everywhere, no exceptions

## State Definitions

### `states/spawn.ts`

```typescript
export const spawnState: WorkflowStateDefinition = {
  emoji: '🟣',
  agentInstructions: 'states/spawn.md',
  canTransitionTo: ['PLANNING', 'BLOCKED'],
  allowedWorkflowOperations: ['record-issue'],

  transitionGuard: (ctx) => {
    if (!ctx.state.githubIssue)
      return fail('githubIssue not set. Run record-issue <number> first.')
    if (!ctx.state.activeAgents.some((n) => n.startsWith('developer-')))
      return fail('No developer agent spawned.')
    if (!ctx.state.activeAgents.some((n) => n.startsWith('reviewer-')))
      return fail('No reviewer agent spawned.')
    return pass()
  },
}
```

### `states/planning.ts`

```typescript
export const planningState: WorkflowStateDefinition = {
  emoji: '⚪',
  agentInstructions: 'states/planning.md',
  canTransitionTo: ['RESPAWN', 'BLOCKED'],
  allowedWorkflowOperations: ['record-branch', 'record-plan-approval', 'append-issue-checklist'],

  allowForbidden: {
    bash: ['git checkout'],
  },

  transitionGuard: (ctx) => {
    if (!ctx.state.userApprovedPlan)
      return fail('userApprovedPlan is false. Run record-plan-approval.')
    if (!ctx.gitInfo.workingTreeClean)
      return fail('Working tree is not clean.')
    return pass()
  },
}
```

### `states/respawn.ts`

```typescript
export const respawnState: WorkflowStateDefinition = {
  emoji: '🔄',
  agentInstructions: 'states/respawn.md',
  canTransitionTo: ['DEVELOPING', 'BLOCKED'],
  allowedWorkflowOperations: ['assign-iteration-task'],

  forbidden: {
    write: true,
  },

  transitionGuard: (ctx) => {
    if (!ctx.state.currentIterationTask)
      return fail('currentIterationTask not set. Run assign-iteration-task first.')
    if (ctx.state.activeAgents.length > 0)
      return fail(`Active agents still registered: [${ctx.state.activeAgents.join(', ')}].`)
    return pass()
  },

  onEntry: (state) => {
    const { currentIterationTask: _removed, ...rest } = state
    return rest
  },
}
```

### `states/developing.ts`

```typescript
export const developingState: WorkflowStateDefinition = {
  emoji: '🔨',
  agentInstructions: 'states/developing.md',
  canTransitionTo: ['REVIEWING', 'BLOCKED'],
  allowedWorkflowOperations: ['signal-done'],

  transitionGuard: (ctx) => {
    if (!ctx.state.developerDone)
      return fail('developerDone is false. Developer must run signal-done first.')
    if (ctx.gitInfo.workingTreeClean)
      return fail('No uncommitted changes found.')
    if (ctx.state.developingHeadCommit && ctx.gitInfo.headCommit !== ctx.state.developingHeadCommit)
      return fail(`New commits detected. HEAD was '${ctx.state.developingHeadCommit}'.`)
    return pass()
  },

  onEntry: (state, ctx) => ({
    ...state,
    ...(ctx.from === 'RESPAWN' ? { iteration: state.iteration + 1 } : {}),
    developerDone: false,
    developingHeadCommit: ctx.gitInfo.headCommit,
    lintedFiles: [],
  }),
}
```

### `states/reviewing.ts`

```typescript
export const reviewingState: WorkflowStateDefinition = {
  emoji: '📋',
  agentInstructions: 'states/reviewing.md',
  canTransitionTo: ['COMMITTING', 'DEVELOPING', 'BLOCKED'],
  allowedWorkflowOperations: ['review-approved', 'review-rejected'],

  transitionGuard: (ctx) => {
    if (ctx.to === 'COMMITTING' && !ctx.state.reviewApproved)
      return fail('Review not approved. Run review-approved first.')
    if (ctx.to === 'DEVELOPING' && !ctx.state.reviewRejected)
      return fail('Review not rejected. Run review-rejected first.')
    return pass()
  },
}
```

### `states/committing.ts`

```typescript
export const committingState: WorkflowStateDefinition = {
  emoji: '💾',
  agentInstructions: 'states/committing.md',
  canTransitionTo: ['RESPAWN', 'CR_REVIEW', 'BLOCKED'],
  allowedWorkflowOperations: ['tick-iteration'],

  allowForbidden: {
    bash: ['git commit', 'git push'],
  },

  transitionGuard: (ctx) => {
    if (!ctx.gitInfo.workingTreeClean)
      return fail('Uncommitted changes detected.')

    const lintable = ctx.gitInfo.changedFilesVsDefault.filter(isTypeScriptFile)
    if (lintable.length > 0) {
      if (ctx.state.lintRanIteration !== ctx.state.iteration)
        return fail(`Lint not run this iteration.`)
      const unlinted = lintable.filter((f) => !ctx.state.lintedFiles.includes(f))
      if (unlinted.length > 0)
        return fail(`Unlinted files: [${unlinted.join(', ')}].`)
    }

    if (!ctx.gitInfo.hasCommitsVsDefault)
      return fail('No commits beyond default branch.')

    return pass()
  },
}
```

### `states/cr-review.ts`

```typescript
export const crReviewState: WorkflowStateDefinition = {
  emoji: '🐰',
  agentInstructions: 'states/cr-review.md',
  canTransitionTo: ['PR_CREATION', 'BLOCKED'],
  allowedWorkflowOperations: ['coderabbit-feedback-addressed', 'coderabbit-feedback-ignored'],

  transitionGuard: (ctx) => {
    if (!ctx.state.coderabbitFeedbackAddressed && !ctx.state.coderabbitFeedbackIgnored)
      return fail('CodeRabbit feedback not resolved. Run coderabbit-feedback-addressed or coderabbit-feedback-ignored.')
    if (ctx.state.coderabbitFeedbackAddressed && !ctx.gitInfo.hasCommitsVsDefault)
      return fail('Feedback marked as addressed but no commits found.')
    return pass()
  },
}
```

### `states/pr-creation.ts`

```typescript
export const prCreationState: WorkflowStateDefinition = {
  emoji: '🚀',
  agentInstructions: 'states/pr-creation.md',
  canTransitionTo: ['FEEDBACK', 'BLOCKED'],
  allowedWorkflowOperations: ['record-pr', 'create-pr'],

  transitionGuard: (ctx) => {
    if (!ctx.state.prNumber)
      return fail('prNumber not set. Run record-pr or create-pr first.')
    if (!readPrChecksPass(ctx))
      return fail(`PR checks failing for PR #${ctx.state.prNumber}.`)
    return pass()
  },
}
```

### `states/feedback.ts`

```typescript
export const feedbackState: WorkflowStateDefinition = {
  emoji: '💬',
  agentInstructions: 'states/feedback.md',
  canTransitionTo: ['COMPLETE', 'RESPAWN', 'BLOCKED'],
  allowedWorkflowOperations: [],
}
```

### `states/blocked.ts`

```typescript
export const blockedState: WorkflowStateDefinition = {
  emoji: '⚠️',
  agentInstructions: 'states/blocked.md',
  canTransitionTo: [], // dynamically: returns to preBlockedState only
  allowedWorkflowOperations: [],

  transitionGuard: (ctx) => {
    if (ctx.to !== ctx.state.preBlockedState)
      return fail(`Must return to pre-blocked state: ${ctx.state.preBlockedState ?? 'unknown'}.`)
    return pass()
  },

  onEntry: (state, ctx) => ({
    ...state,
    preBlockedState: ctx.from,
  }),
}
```

### `states/complete.ts`

```typescript
export const completeState: WorkflowStateDefinition = {
  emoji: '✅',
  agentInstructions: 'states/complete.md',
  canTransitionTo: [],
  allowedWorkflowOperations: [],
}
```

## Registry

```typescript
type WorkflowRegistry = { readonly [K in StateName]: WorkflowStateDefinition }

export const WORKFLOW_REGISTRY = {
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
} as const satisfies WorkflowRegistry
```

Compile-time guarantees:
- Missing state → compiler error
- Invalid `StateName` in `canTransitionTo` → compiler error
- Invalid `WorkflowOperation` in `allowedWorkflowOperations` → compiler error

## Transition Flow

```
1. Apply global rules  → registry.globalTransitionRules (e.g. BLOCKED handling)
2. Check legality      → is `to` in WORKFLOW_REGISTRY[from].canTransitionTo?
3. Check guard         → WORKFLOW_REGISTRY[from].transitionGuard?.(ctx)
4. Apply entry         → WORKFLOW_REGISTRY[to].onEntry?.(state, ctx)
5. Set state.state     → to
```

## BLOCKED State

BLOCKED is a normal state defined in the registry, not hardcoded in the aggregate.

- Every state includes `'BLOCKED'` in `canTransitionTo`
- BLOCKED's `onEntry` sets `preBlockedState` from the source state
- BLOCKED's `transitionGuard` enforces return to `preBlockedState` only
- Global transition rules (on the registry) handle the "any state → BLOCKED" universality
- Unit test iterates all states to verify each can transition to BLOCKED

## Architecture

### Bounded Contexts

Three modules, each a separate bounded context with its own domain:

```
entrypoint.ts → workflow-definition/ → workflow-dsl/
                                     → workflow-engine/
```

| Module | Domain | Aggregate | Depends on |
|---|---|---|---|
| `workflow-dsl/` | Type system for defining workflows | Types + `pass()`/`fail()` | Nothing |
| `workflow-engine/` | Generic workflow runtime | `Engine` | `workflow-dsl/` only |
| `workflow-definition/` | This specific workflow | `Workflow` | `workflow-dsl/` + `workflow-engine/` |

### Module Privacy

**Private by default. `index.ts` is the gate.**

Each module exports only through its `index.ts`. Everything inside `domain/` is private — no external module may import it directly.

```typescript
// ✅ Allowed
import { Workflow } from './workflow-definition/index.js'

// ❌ Forbidden — reaching into private internals
import { spawnState } from './workflow-definition/domain/states/spawn/spawn.js'
import { Engine } from './workflow-engine/domain/engine.js'
```

**Enforced by dependency-cruiser:**
1. `workflow-dsl/` cannot import from `workflow-definition/` or `workflow-engine/`
2. `workflow-engine/` cannot import from `workflow-definition/`
3. `entrypoint.ts` cannot import from `workflow-engine/` or `workflow-dsl/`
4. No external imports of `*/domain/**` — only `*/index.ts`

### Aggregate Root

`Workflow` is the single public interface of `workflow-definition/`. All operations, transitions, and state queries go through it. `entrypoint.ts` calls `workflow.<method>()` — never reaches into operations, states, or engine internals.

### File Structure

```
src/
├── workflow-dsl/                            ← bounded context: type system
│   ├── index.ts                             ← public exports
│   └── domain/
│       ├── types.ts                         ← WorkflowStateDefinition, TransitionContext, etc.
│       └── result.ts                        ← PreconditionResult, pass(), fail()
│
├── workflow-engine/                         ← bounded context: generic runtime
│   ├── index.ts                             ← public exports
│   └── domain/
│       ├── engine.ts                        ← transition(), runOperation()
│       ├── hook-evaluator.ts                ← forbidden/allowForbidden evaluation
│       ├── workflow-state.ts                ← Zod schema, StateName, WorkflowState
│       ├── event-log.ts
│       ├── output-guidance.ts
│       ├── identity-rules.ts
│       └── spawn-rules.ts
│
├── workflow-definition/                     ← bounded context: this workflow
│   ├── index.ts                             ← public exports (Workflow only)
│   └── domain/
│       ├── workflow.ts                      ← Workflow aggregate — single public API
│       ├── states/
│       │   ├── spawn/
│       │   │   ├── spawn.ts
│       │   │   └── spawn.md
│       │   ├── planning/
│       │   │   ├── planning.ts
│       │   │   └── planning.md
│       │   ├── respawn/
│       │   │   ├── respawn.ts
│       │   │   └── respawn.md
│       │   ├── developing/
│       │   │   ├── developing.ts
│       │   │   └── developing.md
│       │   ├── reviewing/
│       │   │   ├── reviewing.ts
│       │   │   └── reviewing.md
│       │   ├── committing/
│       │   │   ├── committing.ts
│       │   │   └── committing.md
│       │   ├── cr-review/
│       │   │   ├── cr-review.ts
│       │   │   └── cr-review.md
│       │   ├── pr-creation/
│       │   │   ├── pr-creation.ts
│       │   │   └── pr-creation.md
│       │   ├── feedback/
│       │   │   ├── feedback.ts
│       │   │   └── feedback.md
│       │   ├── blocked/
│       │   │   ├── blocked.ts
│       │   │   └── blocked.md
│       │   └── complete/
│       │       ├── complete.ts
│       │       └── complete.md
│       ├── registry.ts                      ← WORKFLOW_REGISTRY + globalForbidden
│       └── operations/                      ← one file per workflow operation
│           ├── record-issue.ts
│           ├── record-branch.ts
│           ├── record-plan-approval.ts
│           ├── assign-iteration-task.ts
│           ├── signal-done.ts
│           ├── record-pr.ts
│           ├── create-pr.ts
│           ├── append-issue-checklist.ts
│           ├── tick-iteration.ts
│           ├── review-approved.ts
│           ├── review-rejected.ts
│           ├── coderabbit-feedback-addressed.ts
│           ├── coderabbit-feedback-ignored.ts
│           ├── run-lint.ts
│           └── transition.ts
│
├── infra/                                   ← all I/O (unchanged)
│
└── entrypoint.ts                            ← thin adapter → workflow.<method>()
```

## IterationState

```typescript
type IterationState = {
  task: string
  developerDone: boolean
  developingHeadCommit?: string
  reviewApproved: boolean
  reviewRejected: boolean
  coderabbitFeedbackAddressed: boolean
  coderabbitFeedbackIgnored: boolean
  lintedFiles: string[]
  lintRanIteration: boolean
}

type WorkflowState = {
  state: StateName
  iteration: number                // explicit, authoritative
  iterations: IterationState[]     // history, indexed by iteration
  githubIssue?: number
  featureBranch?: string
  prNumber?: number
  userApprovedPlan: boolean
  activeAgents: string[]
  preBlockedState?: StateName
  eventLog: EventLogEntry[]
}
```

## Testing Strategy

### Principle: Test Each Bounded Context Through Its Aggregate

Each bounded context is a DDD aggregate. All tests go through the aggregate's public API. No testing of private internals directly.

| Bounded Context | Aggregate Under Test | Test File |
|---|---|---|
| `workflow-definition/` | `Workflow` | `workflow-definition/domain/workflow.spec.ts` |
| `workflow-engine/` | `Engine` | `workflow-engine/domain/engine.spec.ts` |
| `workflow-dsl/` | `pass()`/`fail()` + types | `workflow-dsl/domain/result.spec.ts` |

### Workflow Aggregate Tests

All workflow domain behavior — guards, transitions, operations, effects, forbidden rules — tested through the `Workflow` public API. No direct testing of state definitions, registry, or individual operations.

```typescript
describe('SPAWN state', () => {
  it('allows transition to PLANNING when issue set and team spawned', () => {
    const workflow = Workflow.rehydrate(spawnStateWithTeam)
    workflow.recordIssue(42)
    const result = workflow.transitionTo('PLANNING')
    expect(result.pass).toStrictEqual(true)
  })

  it.each(['RESPAWN', 'DEVELOPING', 'REVIEWING', 'COMMITTING'] as const)(
    'does not allow transitioning to %s',
    (target) => {
      const workflow = Workflow.rehydrate(spawnStateWithTeam)
      workflow.recordIssue(42)
      expect(workflow.transitionTo(target)).toStrictEqual(fail('...'))
    },
  )
})
```

`Workflow.rehydrate(state)` constructs a `Workflow` from persisted state — enables testing any state configuration without replaying the full history.

### Engine Tests

Tested with fake registries (2–3 fake states). Verifies the generic 5-step transition flow, guard ordering, effect application. No knowledge of real workflow states.

### What Current Tests Become

| Current spec | Becomes |
|---|---|
| `preconditions.spec.ts` | Covered by `Workflow` aggregate tests |
| `transition-effects.spec.ts` | Covered by `Workflow` aggregate tests |
| `transition-map.spec.ts` | Compile-time check (`satisfies WorkflowRegistry`) + `Workflow` aggregate tests |
| `operation-gates.spec.ts` | Covered by `Workflow` aggregate tests |
| `state-procedure-map.spec.ts` | Deleted — `agentInstructions` field on each state |
| `hook-rules.spec.ts` | `Engine` aggregate tests (hook evaluation is engine concern) |
| `identity-rules.spec.ts` | `Engine` aggregate tests |
| `spawn-rules.spec.ts` | `Engine` aggregate tests |
| `event-log.spec.ts` | Moves to `workflow-engine/domain/event-log.spec.ts` |
| `output-guidance.spec.ts` | Moves to `workflow-engine/domain/output-guidance.spec.ts` |
| `workflow-state.spec.ts` | Moves to `workflow-engine/domain/workflow-state.spec.ts` |
| `operations/*.spec.ts` | Covered by `Workflow` aggregate tests |
| `autonomous-claude-agent-team-workflow.spec.ts` | Thin entrypoint spec (delegation only) |

### Coverage

100% coverage maintained. All branches in guards, effects, and operations reached via `Workflow.rehydrate(state)` setups through the aggregate's public API.

## Implementation Plan

### Phase 1: Create the DSL type system

Create `src/workflow-dsl/` with zero dependencies.

**New files:**
- `src/workflow-dsl/index.ts` — public exports
- `src/workflow-dsl/domain/types.ts` — `WorkflowStateDefinition`, `TransitionContext`, `WorkflowOperation`, `ForbiddenBashCommand`, `WorkflowRegistry`
- `src/workflow-dsl/domain/result.ts` — `PreconditionResult`, `pass()`, `fail()`

**Source material:** Type definitions from this plan. `PreconditionResult` already exists in `domain/preconditions.ts` — extract and generalize (remove `GitInfo` coupling).

**Tests:** `src/workflow-dsl/domain/result.spec.ts` — unit tests for `pass()`/`fail()`.

**Verify:** `workflow-dsl/` imports nothing from `src/`.

### Phase 2: Restructure WorkflowState with IterationState

Modify `domain/workflow-state.ts` (stays in place for now — moves in Phase 5).

**Changes:**
- Add `IterationState` Zod schema
- Add `iterations: z.array(IterationState)` to `WorkflowState`
- Keep `iteration: z.number()` as explicit authoritative field
- Remove iteration-specific fields from top-level: `developerDone`, `developingHeadCommit`, `lintedFiles`, `lintRanIteration`, `currentIterationTask`
- Add `reviewApproved`, `reviewRejected`, `coderabbitFeedbackAddressed`, `coderabbitFeedbackIgnored` to `IterationState`
- Remove `commitsBlocked` (derivable from registry)
- Update `INITIAL_STATE`

**Ripple:** Every file that reads/writes these fields must update to `state.iterations[state.iteration]`. This touches:
- `domain/preconditions.ts` — guards reading `developerDone`, `developingHeadCommit`, `lintedFiles`, `lintRanIteration`, `currentIterationTask`
- `domain/transition-effects.ts` — mutations setting these fields
- `domain/hook-rules.ts` — `checkCommitBlock` reads `commitsBlocked`, `checkDeveloperIdle` reads `developerDone`
- `operations/signal-done.ts`, `operations/assign-iteration-task.ts`, `operations/run-lint.ts` — write iteration fields
- `domain/output-guidance.ts` — reads `currentIterationTask`
- `autonomous-claude-agent-team-workflow.spec.ts` — test fixtures

**Strategy:** Do this in one commit. All tests must pass before and after. No partial migration.

### Phase 3: Create state definition files

Create `src/workflow-definition/states/` with one folder per state.

**For each state (11 total):**
1. Create `src/workflow-definition/states/{name}/{name}.ts` exporting a `WorkflowStateDefinition`
2. Move the corresponding `states/{name}.md` to `src/workflow-definition/states/{name}/{name}.md`

**Where the data comes from:**

| Field | Source |
|---|---|
| `emoji` | `domain/identity-rules.ts` → `STATE_EMOJI_MAP` |
| `agentInstructions` | `domain/state-procedure-map.ts` → `getProcedurePath` (now a relative path string) |
| `canTransitionTo` | `domain/transition-map.ts` → `TRANSITION_MAP` |
| `allowedWorkflowOperations` | `domain/operation-gates.ts` → `OPERATION_GATES` (inverted: currently keyed by operation, needs to be keyed by state) |
| `forbidden` | `domain/hook-rules.ts` → `checkWriteBlock` (RESPAWN only) |
| `allowForbidden` | `domain/hook-rules.ts` → commit/push in COMMITTING, checkout in PLANNING |
| `transitionGuard` | `domain/preconditions.ts` → `TRANSITION_CHECKS` + `checkDevelopingEntry` etc. |
| `onEntry` | `domain/transition-effects.ts` → `applyTransitionEffects` (DEVELOPING, RESPAWN entries) |

**New operations for states that had no guards:**
- `review-approved` / `review-rejected` — new operations for REVIEWING
- `coderabbit-feedback-addressed` / `coderabbit-feedback-ignored` — new operations for CR_REVIEW

**Operation files for new operations:**
- `src/workflow-definition/operations/review-approved.ts`
- `src/workflow-definition/operations/review-rejected.ts`
- `src/workflow-definition/operations/coderabbit-feedback-addressed.ts`
- `src/workflow-definition/operations/coderabbit-feedback-ignored.ts`

**No per-state unit tests.** All state behavior tested through the `Workflow` aggregate in Phase 4.

### Phase 4: Create registry and aggregate root

**New files:**
- `src/workflow-definition/index.ts` — public exports (`Workflow` only)
- `src/workflow-definition/domain/registry.ts` — `WORKFLOW_REGISTRY` (imports all 11 state definitions, exports `satisfies WorkflowRegistry`), `globalForbidden`
- `src/workflow-definition/domain/workflow.ts` — `Workflow` aggregate root, single public API

**`Workflow` responsibilities:**
- Operation gating (currently `checkOperationGate` — now reads `allowedWorkflowOperations` from registry)
- Transition orchestration (currently `runTransition` — now uses registry for guards/effects)
- Hook permission checks (entrypoint parses hook stdin → calls `workflow.checkWriteAllowed()`, `workflow.checkBashAllowed(cmd)`, etc.)

**NOT `Workflow` responsibilities** (these stay on the entrypoint):
- Arg parsing (currently in entrypoint's `handle*` functions)
- Command routing (currently in entrypoint's `COMMAND_HANDLERS`)
- Dependency assembly (currently in entrypoint per-handler)

**`Workflow` public API shape:**

```typescript
class Workflow {
  static rehydrate(state: WorkflowState, deps: WorkflowDeps): Workflow
  transitionTo(target: StateName): OperationResult
  recordIssue(issueNumber: number): OperationResult
  recordBranch(branch: string): OperationResult
  signalDone(): OperationResult
  // ... one method per workflow operation
  checkWriteAllowed(): PreconditionResult
  checkBashAllowed(command: string): PreconditionResult
  checkCommitAllowed(): PreconditionResult
  checkPluginSourceRead(path: string): PreconditionResult
  checkIdleAllowed(agentName: string, transcript: AssistantMessage[]): PreconditionResult
}
```

The entrypoint parses args/stdin and calls the appropriate `Workflow` method. `Workflow` is a domain aggregate — it knows nothing about CLI args, stdin, or process exit codes.

**Tests:** `src/workflow-definition/domain/workflow.spec.ts` — aggregate tests. All workflow domain behavior tested through `Workflow` public API. Covers transitions, guards, operations, effects, forbidden rules. Uses `Workflow.rehydrate()` to set up any state configuration.

### Phase 5: Move engine files to workflow-engine/

Move existing domain files to their new homes. Pure file moves + import path updates.

| From | To |
|---|---|
| `domain/workflow-state.ts` | `workflow-engine/domain/workflow-state.ts` |
| `domain/event-log.ts` | `workflow-engine/domain/event-log.ts` |
| `domain/output-guidance.ts` | `workflow-engine/domain/output-guidance.ts` |
| `domain/identity-rules.ts` | `workflow-engine/domain/identity-rules.ts` |
| `domain/spawn-rules.ts` | `workflow-engine/domain/spawn-rules.ts` |

**New files:**
- `src/workflow-engine/index.ts` — public exports
- `src/workflow-engine/domain/engine.ts` — generic `transition()` function implementing the 5-step flow. No knowledge of specific states. Receives registry + context, runs guards/effects.

**Deleted (absorbed into state definitions):**
- `domain/transition-map.ts` + spec
- `domain/preconditions.ts` + spec
- `domain/transition-effects.ts` + spec
- `domain/operation-gates.ts` + spec
- `domain/state-procedure-map.ts` + spec

**Refactored (logic stays, reads from registry):**
- `domain/hook-rules.ts` → `workflow-engine/domain/hook-evaluator.ts` — evaluation logic (regex matching, tool name checks) stays. Blocking decisions come from registry's `globalForbidden` + state's `forbidden`/`allowForbidden`.

**Tests:** `workflow-engine/domain/engine.spec.ts` — tested with fake registries (2–3 fake states). Verifies generic transition flow, guard ordering, effect application. No knowledge of real workflow states. Moved specs update import paths.

### Phase 6: Rewrite entrypoint

Replace `autonomous-claude-agent-team-workflow.ts` with thin adapter.

**Before (current):** 420 lines, 20+ imports, hand-wired handlers, manual dependency assembly.

**After:** Thin adapter that parses args/stdin and dispatches to `Workflow` domain methods. Arg parsing and command routing stay here — `Workflow` is a domain aggregate, not a CLI handler.

```typescript
import { Workflow } from './workflow-definition/index.js'

const workflow = Workflow.rehydrate(state, buildRealDeps())

// Entrypoint parses args and calls the right domain method
const [command, ...args] = process.argv.slice(2)
switch (command) {
  case 'transition': return workflow.transitionTo(args[0] as StateName)
  case 'record-issue': return workflow.recordIssue(Number(args[0]))
  // ...
}
```

**No imports from:** `workflow-engine/`, `workflow-dsl/`, `domain/`.

**Tests:** Entrypoint spec verifies arg parsing dispatches to correct `Workflow` methods. No operation-level testing — that's `workflow.spec.ts`'s job.

### Phase 7: Move operations to workflow-definition/

Move `src/operations/*` → `src/workflow-definition/domain/operations/*`. Update import paths.

Operations are private internals of `workflow-definition/domain/` — only `workflow.ts` imports them. No operation spec files — all operation behavior tested through `Workflow` aggregate.

### Phase 8: Dependency enforcement

**Install dependency-cruiser:**

```bash
pnpm add -D dependency-cruiser
```

**Create `.dependency-cruiser.cjs` with rules:**

1. `workflow-dsl/` cannot import from `workflow-definition/` or `workflow-engine/`
2. `workflow-engine/` cannot import from `workflow-definition/`
3. `entrypoint.ts` cannot import from `workflow-engine/` or `workflow-dsl/`
4. No external imports of `*/domain/**` — only `*/index.ts` (enforces module privacy)

**Add npm script:** `pnpm depcruise` — runs in CI alongside lint/typecheck/test.

### Phase 9: Documentation

- **`docs/architecture.md`** — bounded context structure, module privacy (`index.ts` gate pattern), dependency direction, aggregate root pattern, dependency-cruiser rules, design principles (state ownership, observability, code guides agents, forbidden patterns). Authoritative reference.
- **`docs/testing-strategy.md`** — aggregate testing approach, `Workflow.rehydrate()` pattern, what current tests become, coverage strategy. Referenced from `CLAUDE.md`.
- **`CLAUDE.md` update** — reference `docs/testing-strategy.md` and `docs/architecture.md`.
- **README update** — annotated state example explaining each field. `agentInstructions` displayed on state entry and on workflow command failure.

### Migration strategy

Each phase produces a green build (typecheck + lint + test + 100% coverage). No phase leaves the codebase in a broken state.

Phases 1–2 are independent and can run in parallel.
Phase 3 depends on Phase 1 (needs DSL types) and Phase 2 (needs IterationState).
Phase 4 depends on Phase 3.
Phases 5–7 depend on Phase 4.
Phase 8 depends on Phases 5–7.
Phase 9 can run anytime after Phase 4.

### What stays unchanged

- `src/infra/*` — all I/O code stays exactly where it is
- `states/*.md` — content unchanged, files move to `workflow-definition/states/{name}/{name}.md`
- Test coverage requirement — 100% enforced throughout

## Progress

### Done

- [x] **Phase 1** — Create `workflow-dsl/` bounded context
  - [x] `workflow-dsl/domain/types.ts` — `WorkflowStateDefinition`, `TransitionContext`, `WorkflowOperation`, `ForbiddenBashCommand`, `WorkflowRegistry`
  - [x] `workflow-dsl/domain/result.ts` — `PreconditionResult`, `pass()`, `fail()`
  - [x] `workflow-dsl/index.ts` — public exports
  - [x] `workflow-dsl/domain/result.spec.ts`
- [x] **Phase 2** — Restructure `WorkflowState` with `IterationState`
  - [x] `IterationState` Zod schema with per-iteration fields
  - [x] `iterations: IterationState[]` on `WorkflowState`
  - [x] Removed `commitsBlocked` (derivable from registry)
  - [x] All consumers updated to use `state.iterations[state.iteration]`
- [x] **Phase 3** — Create state definition files
  - [x] All 11 state definitions in `workflow-definition/domain/states/{name}/{name}.ts`
  - [x] `states/*.md` moved to `workflow-definition/domain/states/{name}/{name}.md`
  - [x] New operations: `review-approved`, `review-rejected`, `coderabbit-feedback-addressed`, `coderabbit-feedback-ignored`
- [x] **Phase 4 (partial)** — Registry and Workflow aggregate
  - [x] `workflow-definition/domain/registry.ts` — `WORKFLOW_REGISTRY` (`satisfies WorkflowRegistry`)
  - [x] `workflow-definition/domain/workflow.ts` — `Workflow` aggregate with `rehydrate()`, `transitionTo()`, 14 operation methods
  - [x] `workflow-definition/index.ts` — exports `Workflow` only
  - [x] `workflow-definition/domain/workflow.spec.ts` — 94 aggregate tests
- [x] **Phase 5 (partial)** — Move engine files
  - [x] `workflow-state.ts`, `event-log.ts`, `output-guidance.ts`, `identity-rules.ts`, `spawn-rules.ts` moved to `workflow-engine/domain/`
  - [x] Import paths updated across codebase
- [x] **Phase 7 (partial)** — Delete dead code
  - [x] Deleted 10 old operation files + specs (record-issue, record-branch, etc.)
  - [x] Deleted `domain/preconditions.ts`, `domain/transition-effects.ts`, `domain/transition-map.ts` + specs
  - [x] `git.ts` GitInfo import updated to `workflow-dsl`
- [x] **Phase 8 (partial)** — Dependency enforcement
  - [x] dependency-cruiser installed with boundary rules
  - [x] `pnpm deps` script
  - [x] CI pipeline: 3 parallel jobs (build-lint, test, dependency-boundaries)

### Remaining

- [ ] **Phase 4 gaps** — Workflow aggregate incomplete
  - [ ] Add `globalForbidden` to registry (bash commands + plugin source read patterns)
  - [ ] Add hook permission methods to Workflow: `checkWriteAllowed()`, `checkBashAllowed(cmd)`, `checkCommitAllowed()`, `checkPluginSourceRead(path)`, `checkIdleAllowed(agentName, transcript)`
  - [ ] These methods read `globalForbidden` + current state's `forbidden`/`allowForbidden` from registry
  - [ ] Tests for hook permission methods in `workflow.spec.ts`
  - [ ] Refactor BLOCKED: remove hardcoded handling from `transitionTo()`, make BLOCKED a normal state with `onEntry`/`transitionGuard`, add `'BLOCKED'` to every state's `canTransitionTo`, add global transition rules to registry
- [ ] **Phase 5 gaps** — Engine and hook evaluator
  - [ ] Create `workflow-engine/index.ts` — public exports (barrel file for external consumers)
  - [ ] Create `workflow-engine/domain/engine.ts` — generic `transition()` function implementing the transition flow with fake-registry tests
  - [ ] Refactor `domain/hook-rules.ts` → `workflow-engine/domain/hook-evaluator.ts` — evaluation logic (regex matching, tool name checks) reads blocking decisions from registry instead of hardcoding them
  - [ ] `workflow-engine/domain/engine.spec.ts` — tested with fake registries
- [ ] **Phase 6 gaps** — Entrypoint not yet a thin adapter
  - [ ] Entrypoint still imports from `workflow-engine/domain/` (25 violations of `workflow-engine-module-privacy` rule)
  - [ ] Entrypoint still imports from `domain/operation-gates.ts` and `domain/state-procedure-map.ts`
  - [ ] Entrypoint still imports from `workflow-dsl/` (plan says: no direct imports)
  - [ ] Hook handlers still call old `operations/block-*.ts` files instead of `Workflow` methods
  - [ ] Entrypoint must import ONLY from `workflow-definition/index.ts` + `infra/`
- [ ] **Phase 7 gaps** — Dead code not fully removed
  - [ ] Delete `domain/operation-gates.ts` + spec (absorbed into registry's `allowedWorkflowOperations`)
  - [ ] Delete `domain/state-procedure-map.ts` + spec (absorbed into state definitions' `agentInstructions`)
  - [ ] Delete `domain/hook-rules.ts` + spec (absorbed into Workflow aggregate methods + hook-evaluator)
  - [ ] Move remaining `src/operations/` files into Workflow aggregate or delete:
    - `block-writes.ts` → `Workflow.checkWriteAllowed()`
    - `block-commits.ts` → `Workflow.checkCommitAllowed()`
    - `block-plugin-reads.ts` → `Workflow.checkPluginSourceRead()`
    - `evaluate-idle.ts` → `Workflow.checkIdleAllowed()`
    - `verify-identity.ts` → absorbed into Workflow or stays as engine concern
    - `inject-subagent-context.ts` → absorbed into Workflow or stays as engine concern
    - `init.ts` → stays (initialization is entrypoint concern)
    - `run-lint.ts` → already on Workflow aggregate
    - `shut-down.ts` → absorbed into Workflow or stays as engine concern
    - `persist-session-id.ts` → stays (infra concern)
- [ ] **Phase 8 gaps** — Dependency violations
  - [ ] Fix 25 `workflow-engine-module-privacy` violations (entrypoint + operations reach into `workflow-engine/domain/`)
  - [ ] Add rule: entrypoint cannot import from `workflow-engine/` or `workflow-dsl/`
  - [ ] Add knip to CI
  - [ ] Zero violations across all rules
- [ ] **Phase 9** — Documentation
  - [ ] `docs/architecture.md`
  - [ ] `docs/testing-strategy.md`
  - [ ] Update `CLAUDE.md`

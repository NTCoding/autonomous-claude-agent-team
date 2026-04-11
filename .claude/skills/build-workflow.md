---
name: build-workflow
description: "Build a custom workflow plugin using the @ntcoding/agentic-workflow-builder library. Guides a conversation to capture requirements, then generates a complete, tested, installable Claude Code plugin project."
trigger: /build-workflow
---

# Build Workflow Plugin

Generate a complete Claude Code workflow plugin from a conversational requirements-gathering session.

## Prerequisites

- Node.js 22+ with `npx` on PATH
- `pnpm` installed globally
- The generated project depends on `@ntcoding/agentic-workflow-builder` (installed from GitHub)

## Phase 1: Show Example & Gather Requirements

Show the user this example workflow to ground the conversation:

```
PLANNING --> DEVELOPING --> DONE
```

> A simple 3-state workflow. In PLANNING, the agent gathers requirements and gets approval.
> In DEVELOPING, it writes code — git commits are blocked until review.
> DONE is terminal — no further transitions.

Then ask these questions **one at a time** (wait for each answer before asking the next):

1. **Purpose**: What is this workflow for? (1-2 sentences)
2. **States**: What are the states? List them as a progression (e.g., PLANNING -> DEVELOPING -> REVIEWING -> DONE)
3. **Transitions**: For each state, what states can it transition to? (some may go backwards, e.g., REVIEWING -> DEVELOPING on rejection)
4. **Rules per state**: For each state:
   - What operations can the agent perform? (e.g., "record-approval", "signal-done")
   - What must be true before leaving? (transition guards — e.g., "must have approval before leaving PLANNING")
   - Should file writes or git commands be blocked? (e.g., "no writes during REVIEWING")
5. **Data**: What data does the workflow track across its lifetime? (e.g., approval status, PR number, iteration count)
6. **Plugin name**: What should the plugin be called? (kebab-case, e.g., `code-review-workflow`)

## Phase 2: Confirm Design

Present a summary for the user to confirm or adjust:

### Summary format

```
State Machine:
  STATE_A --> STATE_B --> STATE_C --> DONE

State Table:
| State    | Transitions      | Operations       | Guards              | Restrictions   |
|----------|------------------|------------------|---------------------|----------------|
| STATE_A  | STATE_B          | record-approval  | approval recorded   | -              |
| STATE_B  | STATE_C, STATE_A | signal-done      | done signaled       | block: write   |
| STATE_C  | DONE             | -                | -                   | -              |
| DONE     | -                | -                | -                   | -              |

WorkflowState shape:
{
  currentStateMachineState: string
  approved: boolean
  done: boolean
}

Events:
  session-started, transitioned, approval-recorded, done-signaled
```

Ask the user to confirm or request changes. Loop until confirmed.

## Phase 3: Generate Project

Once confirmed, generate all files in a single pass following the patterns below. After generation, run:

```bash
cd <plugin-name> && pnpm install && pnpm typecheck && pnpm test && pnpm lint
```

Fix any failures before presenting the result.

---

## Generated Project Structure

All paths below are relative to `<plugin-name>/`:

```
<plugin-name>/
+-- .claude-plugin/
|   +-- plugin.json
|   +-- marketplace.json
+-- hooks/
|   +-- hooks.json
+-- src/
|   +-- <plugin-name>-workflow.ts          # Entry point (CLI + hook adapter)
|   +-- workflow-definition/
|   |   +-- index.ts                       # Barrel exports
|   |   +-- domain/
|   |       +-- workflow-types.ts
|   |       +-- workflow-types.spec.ts
|   |       +-- workflow-events.ts
|   |       +-- workflow-events.spec.ts
|   |       +-- workflow.ts
|   |       +-- workflow.spec.ts
|   |       +-- fold.ts
|   |       +-- fold.spec.ts
|   |       +-- registry.ts
|   |       +-- workflow-adapter.ts
|   |       +-- workflow-adapter.spec.ts
|   |       +-- workflow-predicates.ts
|   |       +-- workflow-predicates.spec.ts
|   |       +-- output-messages.ts
|   |       +-- output-messages.spec.ts
|   |       +-- workflow-error.ts
|   |       +-- workflow-test-fixtures.ts
|   |       +-- states/
|   |           +-- <state-name>.ts        # One per state (kebab-case)
|   +-- infra/
|       +-- composition-root.ts            # Real deps wiring (coverage-excluded)
|       +-- hook-io.ts
|       +-- hook-io.spec.ts
|       +-- environment.ts
|       +-- environment.spec.ts
+-- states/
|   +-- <state-name>.md                    # Procedure checklist per state
+-- lint/
|   +-- eslint.config.mjs
|   +-- no-generic-names.js
|   +-- no-line-comments.js
+-- package.json
+-- tsconfig.json
+-- vitest.config.mts
+-- eslint.config.mjs
+-- CLAUDE.md
+-- README.md
```

---

## File Generation Patterns

### 1. package.json

```json
{
  "name": "<plugin-name>-workflow",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint 'src/**/*.ts'",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@ntcoding/agentic-workflow-builder": "NTCoding/autonomous-claude-agent-team#path:/packages/agentic-workflow-builder",
    "@vitest/eslint-plugin": "^1.0.0",
    "typescript-eslint": "^8.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.19.13",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0"
  }
}
```

### 2. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. vitest.config.mts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*-test-fixtures.ts',
        'src/workflow-definition/domain/workflow-types.ts',
        'src/infra/composition-root.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
})
```

### 4. ESLint config files

**`lint/eslint.config.mjs`** — Copy verbatim from this repo's `lint/eslint.config.mjs`:

```javascript
import tseslint from 'typescript-eslint'
import noGenericNames from './no-generic-names.js'

const customRules = {
  plugins: {
    custom: {
      rules: {
        'no-generic-names': noGenericNames,
      },
    },
  },
}

const baseConfig = tseslint.config(
  customRules,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'custom/no-generic-names': 'error',

      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',

      'no-restricted-syntax': [
        'error',
        {
          selector: 'VariableDeclaration[kind="let"]',
          message: 'Use const. Avoid mutation.',
        },
        {
          selector: 'NewExpression[callee.name="Error"]',
          message: 'Use custom precise error classes instead of generic Error or fail assertions in tests.',
        },
      ],
      'prefer-const': 'error',

      'max-lines': ['error', 400],
      'max-depth': ['error', 3],
      complexity: ['error', 12],

      'no-inline-comments': 'error',
      'no-negated-condition': 'error',
    },
  },
)

try {
  const vitest = await import('@vitest/eslint-plugin')
  baseConfig.push({
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest: vitest.default },
    rules: {
      'vitest/prefer-strict-equal': 'error',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/max-expects': ['error', { max: 4 }],
      'vitest/require-to-throw-message': 'error',
    },
  })
} catch {
  // @vitest/eslint-plugin not available — skip vitest rules
}

export default baseConfig
```

**`lint/no-generic-names.js`** — Copy verbatim from this repo's `lint/no-generic-names.js`.

**`lint/no-line-comments.js`** — Copy verbatim from this repo's `lint/no-line-comments.js`.

**`eslint.config.mjs`** (root) — Re-exports from lint:

```javascript
import tseslint from 'typescript-eslint'
import vitestPlugin from '@vitest/eslint-plugin'
import noGenericNames from './lint/no-generic-names.js'
import noLineComments from './lint/no-line-comments.js'

export default tseslint.config(
  {
    plugins: {
      custom: {
        rules: {
          'no-generic-names': noGenericNames,
          'no-line-comments': noLineComments,
        },
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'custom/no-generic-names': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'VariableDeclaration[kind="let"]',
          message: 'Use const. Avoid mutation.',
        },
        {
          selector: 'NewExpression[callee.name="Error"]',
          message: 'Use custom precise error classes instead of generic Error.',
        },
      ],
      'prefer-const': 'error',
      'max-lines': ['error', 400],
      'max-depth': ['error', 3],
      complexity: ['error', 12],
      'custom/no-line-comments': 'error',
      'no-inline-comments': 'error',
      'no-negated-condition': 'error',
    },
  },
  {
    files: ['src/**/*.spec.ts'],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/prefer-strict-equal': 'error',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/max-expects': ['error', { max: 4 }],
      'vitest/require-to-throw-message': 'error',
    },
  },
)
```

### 5. Plugin wiring

**`.claude-plugin/plugin.json`**:

```json
{
  "name": "<plugin-name>",
  "version": "1.0.0",
  "description": "<user's purpose description>"
}
```

**`.claude-plugin/marketplace.json`**:

```json
{
  "name": "<plugin-name>",
  "owner": { "name": "<github-username-or-org>" },
  "metadata": {
    "description": "<user's purpose description>",
    "version": "1.0.0"
  },
  "plugins": [{ "name": "<plugin-name>", "source": "./" }],
  "version": "1.0.0"
}
```

**`hooks/hooks.json`**:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/src/<plugin-name>-workflow.ts", "timeout": 30 }] }],
    "PreToolUse":   [{ "hooks": [{ "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/src/<plugin-name>-workflow.ts", "timeout": 30 }] }]
  }
}
```

### 6. workflow-types.ts

```typescript
import { z } from 'zod'
import type { WorkflowStateDefinition, WorkflowRegistry } from '@ntcoding/agentic-workflow-builder/dsl'

export const STATE_NAMES = [
  // <list user's states here, e.g.: 'PLANNING', 'DEVELOPING', 'DONE'>
] as const

export type StateName = (typeof STATE_NAMES)[number]

export const StateNameSchema = z.enum(STATE_NAMES)

// <Add Zod schemas for any nested domain data>

export type WorkflowState = {
  currentStateMachineState: string
  // <user's custom fields here>
}

// <Define WorkflowOperation as a union of string literals for all operations>
export type WorkflowOperation = '<op-1>' | '<op-2>'

// <Define ForbiddenBashCommand if any states block bash commands>
export type ForbiddenBashCommand = 'git commit' | 'git push'

export type ConcreteStateDefinition = WorkflowStateDefinition<
  WorkflowState, StateName, WorkflowOperation, ForbiddenBashCommand
>

export type ConcreteRegistry = WorkflowRegistry<
  WorkflowState, StateName, WorkflowOperation, ForbiddenBashCommand
>

export const INITIAL_STATE: WorkflowState = {
  currentStateMachineState: '<first-state>',
  // <defaults for all user fields>
}

export function parseStateName(value: string): StateName {
  return StateNameSchema.parse(value)
}

export const STATE_EMOJI_MAP: Readonly<Record<StateName, string>> = {
  // <assign an emoji per state>
}
```

**If no states block bash commands**, omit `ForbiddenBashCommand` and use the 2-type-param versions:

```typescript
export type ConcreteStateDefinition = WorkflowStateDefinition<WorkflowState, StateName, WorkflowOperation>
export type ConcreteRegistry = WorkflowRegistry<WorkflowState, StateName, WorkflowOperation>
```

### 7. workflow-events.ts

```typescript
import { z } from 'zod'
import { BaseEventSchema } from '@ntcoding/agentic-workflow-builder/engine'

const SessionStartedSchema = BaseEventSchema.extend({
  type: z.literal('session-started'),
})

const TransitionedSchema = BaseEventSchema.extend({
  type: z.literal('transitioned'),
  from: z.string(),
  to: z.string(),
})

// <One schema per user operation, e.g.:>
const ApprovalRecordedSchema = BaseEventSchema.extend({
  type: z.literal('approval-recorded'),
})

export const WorkflowEventSchema = z.discriminatedUnion('type', [
  SessionStartedSchema,
  TransitionedSchema,
  ApprovalRecordedSchema,
  // <all event schemas>
])

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>
```

**BaseEventSchema** provides `{ type: z.string(), at: z.string() }`. Extend it with `type: z.literal('...')` plus any event-specific fields.

### 8. fold.ts

```typescript
import type { WorkflowEvent } from './workflow-events.js'
import type { WorkflowState } from './workflow-types.js'
import { INITIAL_STATE } from './workflow-types.js'

export function applyEvent(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  switch (event.type) {
    case 'session-started':
      return state
    case 'transitioned':
      return { ...state, currentStateMachineState: event.to }
    // <one case per event that modifies state>
    case 'approval-recorded':
      return { ...state, approved: true }
    default:
      return state
  }
}

export function applyEvents(events: readonly WorkflowEvent[]): WorkflowState {
  return events.reduce(applyEvent, INITIAL_STATE)
}
```

### 9. workflow.ts

```typescript
import type { PreconditionResult } from '@ntcoding/agentic-workflow-builder/dsl'
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'
import type { RehydratableWorkflow } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowState } from './workflow-types.js'
import { parseStateName, WorkflowStateSchema } from './workflow-types.js'
import type { WorkflowEvent } from './workflow-events.js'
import { applyEvent } from './fold.js'
import { WORKFLOW_REGISTRY, getStateDefinition } from './registry.js'
import type { StateName } from './workflow-types.js'
import { checkOperationGate } from './workflow-predicates.js'

export type WorkflowDeps = {
  readonly now: () => string
  // <add deps the workflow needs — e.g. getGitInfo, fileExists>
}

export class Workflow implements RehydratableWorkflow<WorkflowState> {
  private state: WorkflowState
  private readonly deps: WorkflowDeps
  private pendingEvents: WorkflowEvent[] = []

  private constructor(state: WorkflowState, deps: WorkflowDeps) {
    this.state = state
    this.deps = deps
  }

  static createFresh(deps: WorkflowDeps): Workflow {
    return new Workflow(INITIAL_STATE, deps)
  }

  static rehydrate(state: WorkflowState, deps: WorkflowDeps): Workflow {
    return new Workflow(WorkflowStateSchema.parse(state), deps)
  }

  static procedurePath(state: string, pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(state).agentInstructions}`
  }

  getState(): WorkflowState {
    return this.state
  }

  getPendingEvents(): readonly WorkflowEvent[] {
    return this.pendingEvents
  }

  getAgentInstructions(pluginRoot: string): string {
    return `${pluginRoot}/${getStateDefinition(this.state.currentStateMachineState).agentInstructions}`
  }

  startSession(transcriptPath: string | undefined, _repository: string | undefined): void {
    this.append({ type: 'session-started', at: this.deps.now() })
  }

  transitionTo(target: string): PreconditionResult {
    const from = parseStateName(this.state.currentStateMachineState)
    const targetState = parseStateName(target)

    const currentDef = WORKFLOW_REGISTRY[from]
    if (!currentDef.canTransitionTo.includes(targetState)) {
      return fail(
        `Illegal transition ${from} -> ${targetState}. Legal: [${currentDef.canTransitionTo.join(', ') || 'none'}].`
      )
    }

    if (currentDef.transitionGuard) {
      const ctx = this.buildTransitionContext(from, targetState)
      const guardResult = currentDef.transitionGuard(ctx)
      if (!guardResult.pass) return guardResult
    }

    const targetDef = WORKFLOW_REGISTRY[targetState]
    if (targetDef.onEntry) {
      targetDef.onEntry(this.state, this.buildTransitionContext(from, targetState))
    }

    this.append({
      type: 'transitioned',
      at: this.deps.now(),
      from,
      to: targetState,
    })

    return pass()
  }

  // <One method per operation. Pattern:>
  // recordApproval(): PreconditionResult {
  //   const gate = checkOperationGate('record-approval', this.state)
  //   if (!gate.pass) return gate
  //   this.append({ type: 'approval-recorded', at: this.deps.now() })
  //   return pass()
  // }

  private append(event: WorkflowEvent): void {
    this.pendingEvents = [...this.pendingEvents, event]
    this.state = applyEvent(this.state, event)
  }

  private buildTransitionContext(from: StateName, to: StateName) {
    return {
      state: this.state,
      gitInfo: { currentBranch: '', workingTreeClean: true, headCommit: '', changedFilesVsDefault: [], hasCommitsVsDefault: false },
      prChecksPass: false,
      from,
      to,
    }
  }
}
```

**If the workflow needs git info or PR checks**, add those to `WorkflowDeps` and wire them into `buildTransitionContext`:

```typescript
export type WorkflowDeps = {
  readonly now: () => string
  readonly getGitInfo: () => GitInfo
  readonly checkPrChecks: (prNumber: number) => boolean
}
```

### 10. registry.ts

```typescript
import type { ConcreteRegistry, ConcreteStateDefinition } from './workflow-types.js'
import { parseStateName } from './workflow-types.js'
// <import each state definition>
import { planningState } from './states/planning.js'
import { developingState } from './states/developing.js'
import { doneState } from './states/done.js'

export function getStateDefinition(state: string): ConcreteStateDefinition {
  return WORKFLOW_REGISTRY[parseStateName(state)]
}

export const WORKFLOW_REGISTRY: ConcreteRegistry = {
  PLANNING: planningState,
  DEVELOPING: developingState,
  DONE: doneState,
}
```

### 11. State definitions (states/<state-name>.ts)

Each state file follows this pattern:

```typescript
import type { ConcreteStateDefinition } from '../workflow-types.js'
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'

export const <stateName>State: ConcreteStateDefinition = {
  emoji: '<emoji>',
  agentInstructions: 'states/<state-name>.md',
  canTransitionTo: [/* target states */],
  allowedWorkflowOperations: [/* operations allowed in this state */],

  // Optional: transition guard
  transitionGuard: (ctx) => {
    // check ctx.state fields, return pass() or fail('reason')
    return pass()
  },

  // Optional: block file writes
  // forbidden: { write: true },

  // Optional: modify state on entry
  // onEntry: (state, ctx) => ({ ...state, someField: newValue }),
}
```

Terminal state (no transitions, no operations):

```typescript
export const doneState: ConcreteStateDefinition = {
  emoji: '...',
  agentInstructions: 'states/done.md',
  canTransitionTo: [],
  allowedWorkflowOperations: [],
}
```

### 12. workflow-predicates.ts

```typescript
import type { PreconditionResult } from '@ntcoding/agentic-workflow-builder/dsl'
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowState, WorkflowOperation } from './workflow-types.js'
import { getStateDefinition } from './registry.js'

export const FILE_WRITING_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'NotebookEdit'])

export function checkOperationGate(op: WorkflowOperation, state: WorkflowState): PreconditionResult {
  const currentDef = getStateDefinition(state.currentStateMachineState)
  if (currentDef.allowedWorkflowOperations.includes(op)) {
    return pass()
  }
  return fail(`${op} is not allowed in state ${state.currentStateMachineState}.`)
}
```

Add write/bash checking methods if any states have `forbidden: { write: true }` or bash restrictions.

### 13. output-messages.ts

```typescript
import type { WorkflowState, WorkflowOperation } from './workflow-types.js'

const CMD = '/<plugin-name>:workflow'

type OperationBodyFn = (state: WorkflowState) => string

const OPERATION_BODIES: Readonly<Record<string, OperationBodyFn | undefined>> = {
  // <one entry per operation, e.g.:>
  // 'record-approval': () => `Approval recorded.\n\n  ${CMD} transition DEVELOPING`,
} satisfies Record<WorkflowOperation, OperationBodyFn>

export function getOperationBody(op: string, state: WorkflowState): string {
  const bodyFn = OPERATION_BODIES[op]
  /* v8 ignore next */
  if (!bodyFn) return op
  return bodyFn(state)
}

export function getTransitionTitle(to: string, _state: WorkflowState): string {
  return to
}
```

### 14. workflow-adapter.ts

```typescript
import type { WorkflowFactory, BaseEvent, PrefixConfig } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowStateError } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowState } from './workflow-types.js'
import { Workflow, type WorkflowDeps } from './workflow.js'
import { INITIAL_STATE, STATE_EMOJI_MAP, parseStateName } from './workflow-types.js'
import { getOperationBody, getTransitionTitle } from './output-messages.js'
import { applyEvents } from './fold.js'
import { WorkflowEventSchema } from './workflow-events.js'

export const WorkflowAdapter: WorkflowFactory<Workflow, WorkflowState, WorkflowDeps> = {
  createFresh(deps: WorkflowDeps): Workflow {
    return Workflow.createFresh(deps)
  },
  rehydrate(events: readonly BaseEvent[], deps: WorkflowDeps): Workflow {
    const workflowEvents = events.map((e) => {
      const result = WorkflowEventSchema.safeParse(e)
      if (!result.success) {
        throw new WorkflowStateError(
          `Unknown event type in store: "${e.type}". Event store may be corrupted or from a newer version.`
        )
      }
      return result.data
    })
    const state = applyEvents(workflowEvents)
    return Workflow.rehydrate(state, deps)
  },
  procedurePath(state: string, pluginRoot: string): string {
    return Workflow.procedurePath(state, pluginRoot)
  },
  initialState(): typeof INITIAL_STATE {
    return INITIAL_STATE
  },
  getEmojiForState(state: string): string {
    return STATE_EMOJI_MAP[parseStateName(state)]
  },
  getOperationBody,
  getTransitionTitle,
}
```

### 15. workflow-error.ts

```typescript
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}
```

### 16. workflow-test-fixtures.ts

```typescript
import { workflowSpec } from '@ntcoding/agentic-workflow-builder/testing'
import type { WorkflowEvent } from './workflow-events.js'
import type { WorkflowState } from './workflow-types.js'
import type { WorkflowDeps } from './workflow.js'
import { Workflow } from './workflow.js'
import { applyEvents } from './fold.js'

const AT = '2026-01-01T00:00:00Z'

export function makeDeps(overrides?: Partial<WorkflowDeps>): WorkflowDeps {
  return {
    now: () => AT,
    // <default stubs for all deps>
    ...overrides,
  }
}

// <Event builder functions — one per event type:>
export function transitioned(from: string, to: string): WorkflowEvent {
  return { type: 'transitioned', at: AT, from, to }
}

export function sessionStarted(): WorkflowEvent {
  return { type: 'session-started', at: AT }
}

// <Composite builders for reaching specific states:>
// export function eventsToState(): readonly WorkflowEvent[] {
//   return [sessionStarted(), transitioned('A', 'B')]
// }

export const spec = workflowSpec<WorkflowEvent, WorkflowState, WorkflowDeps, Workflow>({
  fold: applyEvents,
  rehydrate: (state, deps) => Workflow.rehydrate(state, deps),
  defaultDeps: makeDeps,
  getPendingEvents: (wf) => wf.getPendingEvents(),
  getState: (wf) => wf.getState(),
  mergeDeps: (defaults, overrides) => ({ ...defaults, ...overrides }),
})
```

### 17. Entry point (<plugin-name>-workflow.ts)

```typescript
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { EngineResult } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { WorkflowAdapter } from './workflow-definition/index.js'
import type { Workflow, WorkflowDeps } from './workflow-definition/index.js'
import type { WorkflowState } from './workflow-definition/index.js'
import { StateNameSchema } from './workflow-definition/index.js'
import {
  parsePreToolUseInput,
  parseCommonInput,
  formatDenyDecision,
  EXIT_ALLOW,
  EXIT_ERROR,
  EXIT_BLOCK,
} from './infra/hook-io.js'
import { WorkflowError } from './workflow-definition/domain/workflow-error.js'
import { buildRealDeps } from './infra/composition-root.js'
import type { AdapterDeps } from './infra/composition-root.js'

type OperationResult = { readonly output: string; readonly exitCode: number }

type CommandHandler = (
  args: readonly string[],
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
) => OperationResult

const COMMAND_HANDLERS: Readonly<Record<string, CommandHandler>> = {
  init: handleInit,
  transition: handleTransition,
  // <one entry per CLI operation, e.g.:>
  // 'record-approval': handleRecordApproval,
}

const HOOK_HANDLERS: Readonly<Record<string, (
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
) => OperationResult>> = {
  SessionStart: handleSessionStart,
  PreToolUse: handlePreToolUse,
}

export function runWorkflow(args: readonly string[], deps: AdapterDeps): OperationResult {
  const engine = new WorkflowEngine(WorkflowAdapter, deps.engineDeps, deps.workflowDeps)
  const command = args[0]
  if (!command) {
    return runHookMode(engine, deps)
  }
  const handler = COMMAND_HANDLERS[command]
  if (!handler) {
    return { output: `Unknown command: ${command}`, exitCode: EXIT_ERROR }
  }
  return handler(args, engine, deps)
}

function runHookMode(
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
): OperationResult {
  const stdin = deps.readStdin()
  const cachedDeps: AdapterDeps = { ...deps, readStdin: () => stdin }
  const common = parseCommonInput(stdin)
  const handler = HOOK_HANDLERS[common.hook_event_name]
  if (!handler) {
    return { output: `Unknown hook event: ${common.hook_event_name}`, exitCode: EXIT_ERROR }
  }
  if (common.hook_event_name !== 'SessionStart' && !engine.hasSession(common.session_id)) {
    return { output: '', exitCode: EXIT_ALLOW }
  }
  return handler(engine, cachedDeps)
}

function handleInit(
  _args: readonly string[],
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
): OperationResult {
  return mapResult(engine.startSession(deps.getSessionId()))
}

function handleTransition(
  args: readonly string[],
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
): OperationResult {
  const rawState = args[1]
  if (!rawState) {
    return { output: 'transition: missing required argument <STATE>', exitCode: EXIT_ERROR }
  }
  const parseResult = StateNameSchema.safeParse(rawState)
  if (!parseResult.success) {
    return { output: `transition: invalid state '${rawState}'`, exitCode: EXIT_ERROR }
  }
  return mapResult(engine.transition(deps.getSessionId(), parseResult.data))
}

// <Pattern for operation handlers:>
// function handleRecordApproval(
//   _args: readonly string[],
//   engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
//   deps: AdapterDeps,
// ): OperationResult {
//   return mapResult(
//     engine.transaction(deps.getSessionId(), 'record-approval', (w) => w.recordApproval())
//   )
// }

function handleSessionStart(
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
): OperationResult {
  const hookInput = parseCommonInput(deps.readStdin())
  engine.persistSessionId(hookInput.session_id)
  return { output: '', exitCode: EXIT_ALLOW }
}

function handlePreToolUse(
  engine: WorkflowEngine<Workflow, WorkflowState, WorkflowDeps>,
  deps: AdapterDeps,
): OperationResult {
  const hookInput = parsePreToolUseInput(deps.readStdin())
  // <Add write/bash checks if states have restrictions:>
  // const result = engine.transaction(hookInput.session_id, 'hook-check', (w) => {
  //   return w.checkWriteAllowed(hookInput.tool_name, filePath)
  // })
  // if (result.type === 'blocked') return { output: formatDenyDecision(result.output), exitCode: EXIT_BLOCK }
  return { output: '', exitCode: EXIT_ALLOW }
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new WorkflowError(`Expected string or undefined. Got ${typeof value}: ${String(value)}`)
}

function mapResult(result: EngineResult): OperationResult {
  /* v8 ignore next */
  const exitCode = result.type === 'success' ? EXIT_ALLOW : result.type === 'blocked' ? EXIT_BLOCK : EXIT_ERROR
  return { output: result.output, exitCode }
}

/* v8 ignore start */
function main(): void {
  try {
    const result = runWorkflow(process.argv.slice(2), buildRealDeps())
    process.stdout.write(result.output, () => process.exit(result.exitCode))
  } catch (error) {
    const message = `[${new Date().toISOString()}] HOOK ERROR: ${String(error)}\n`
    process.stderr.write(message)
    appendFileSync('/tmp/<plugin-name>-hook-errors.log', message)
    process.exit(EXIT_ERROR)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
/* v8 ignore stop */
```

### 18. hook-io.ts

```typescript
import { z } from 'zod'
import { WorkflowError } from '../workflow-definition/domain/workflow-error.js'

const HookCommonInput = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string(),
})

const PreToolUseInput = HookCommonInput.extend({
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_use_id: z.string(),
})

type HookCommonInput = z.infer<typeof HookCommonInput>
type PreToolUseInput = z.infer<typeof PreToolUseInput>

export const EXIT_ALLOW = 0
export const EXIT_BLOCK = 2
export const EXIT_ERROR = 1

export function parseCommonInput(raw: string): HookCommonInput {
  return parseWithSchema(HookCommonInput, raw, 'HookCommonInput')
}

export function parsePreToolUseInput(raw: string): PreToolUseInput {
  return parseWithSchema(PreToolUseInput, raw, 'PreToolUseInput')
}

export function formatDenyDecision(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
}

export function formatContextInjection(context: string): string {
  return JSON.stringify({ additionalContext: context })
}

function parseWithSchema<T>(schema: z.ZodType<T>, raw: string, schemaName: string): T {
  const json = tryParseHookJson(raw, schemaName)
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new WorkflowError(`Invalid hook input for ${schemaName}: ${result.error.message}`)
  }
  return result.data
}

function tryParseHookJson(raw: string, schemaName: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw new WorkflowError(`Cannot parse hook input JSON for ${schemaName}: ${String(cause)}`)
  }
}
```

### 19. environment.ts

```typescript
import { WorkflowError } from '../workflow-definition/domain/workflow-error.js'

export function getSessionId(): string {
  const value = process.env['CLAUDE_SESSION_ID']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_SESSION_ID')
  }
  return value
}

export function getPluginRoot(): string {
  const value = process.env['CLAUDE_PLUGIN_ROOT']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_PLUGIN_ROOT')
  }
  return value
}

export function getEnvFilePath(): string {
  const value = process.env['CLAUDE_ENV_FILE']
  if (value === undefined) {
    throw new WorkflowError('Missing required env var: CLAUDE_ENV_FILE')
  }
  return value
}
```

### 20. composition-root.ts

```typescript
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { WorkflowEngineDeps } from '@ntcoding/agentic-workflow-builder/engine'
import { createStore } from '@ntcoding/agentic-workflow-builder/event-store'
import type { WorkflowDeps } from '../workflow-definition/domain/workflow.js'
import { getSessionId, getPluginRoot, getEnvFilePath } from './environment.js'
import { readStdinSync } from './stdin.js'
import { homedir } from 'node:os'

export type AdapterDeps = {
  readonly getSessionId: () => string
  readonly readStdin: () => string
  readonly engineDeps: WorkflowEngineDeps
  readonly workflowDeps: WorkflowDeps
}

/* v8 ignore start */
export function buildRealDeps(): AdapterDeps {
  const dbPath = `${homedir()}/.claude/workflow-events.db`
  const store = createStore(dbPath)

  const engineDeps: WorkflowEngineDeps = {
    store,
    getPluginRoot,
    getEnvFilePath,
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    now: () => new Date().toISOString(),
  }

  const workflowDeps: WorkflowDeps = {
    now: () => new Date().toISOString(),
    // <wire real deps here>
  }

  return {
    getSessionId,
    readStdin: readStdinSync,
    engineDeps,
    workflowDeps,
  }
}
/* v8 ignore stop */
```

Also create `src/infra/stdin.ts`:

```typescript
import { readFileSync } from 'node:fs'

/* v8 ignore start */
export function readStdinSync(): string {
  return readFileSync(0, 'utf-8')
}
/* v8 ignore stop */
```

### 21. workflow-definition/index.ts (barrel)

```typescript
export { Workflow } from './domain/workflow.js'
export type { WorkflowDeps } from './domain/workflow.js'
export { WorkflowAdapter } from './domain/workflow-adapter.js'

export {
  StateNameSchema,
  INITIAL_STATE,
} from './domain/workflow-types.js'

export type {
  WorkflowState,
  StateName,
} from './domain/workflow-types.js'

export type { WorkflowEvent } from './domain/workflow-events.js'
export { WorkflowEventSchema } from './domain/workflow-events.js'

export { applyEvents } from './domain/fold.js'
```

### 22. State procedure files (states/<state-name>.md)

Each state gets a markdown procedure file. Format:

```markdown
# <STATE_NAME>

- [ ] <First thing the agent must do in this state>
- [ ] <Second thing>
- [ ] Transition to <NEXT_STATE>: `/<plugin-name>:workflow transition <NEXT_STATE>`
```

### 23. CLAUDE.md

```markdown
# <plugin-name>

<user's purpose description>

## Build Commands

\`\`\`bash
pnpm install       # install deps
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint src/
pnpm test          # vitest run --coverage (100% required)
\`\`\`

## Coding Standards

- 100% test coverage enforced
- No `any`, no `as` (except `as const`), no `let`
- Zod schemas at all boundaries
- Fail fast: invalid state -> error with context
- No code comments — make code self-explanatory
```

### 24. README.md

Include these sections:

1. **What it is** — brief workflow description
2. **State machine diagram** — ASCII art of states and transitions
3. **Install as Claude Code plugin** — `claude plugin add` or clone + `pnpm install`
4. **Usage** — how to trigger with the slash command, what happens in each state
5. **CLI commands** — table of all available commands (transition + operations)
6. **State procedures** — where to find/edit `states/*.md`
7. **Development** — `pnpm test`, `pnpm lint`, `pnpm typecheck`

---

## Test Writing Patterns

### fold.spec.ts

Test each event type modifies state correctly. Use `applyEvents([...])` with event builders from fixtures:

```typescript
import { applyEvents } from './fold.js'
import { sessionStarted, transitioned } from './workflow-test-fixtures.js'

describe('fold', () => {
  it('applies transitioned event', () => {
    const state = applyEvents([sessionStarted(), transitioned('A', 'B')])
    expect(state.currentStateMachineState).toStrictEqual('B')
  })
})
```

### workflow.spec.ts

Use the `spec` testing DSL from fixtures:

```typescript
import { spec, eventsToPlanningState } from './workflow-test-fixtures.js'

describe('Workflow', () => {
  it('blocks transition when guard fails', () => {
    spec
      .given(eventsToPlanningState())
      .when((w) => w.transitionTo('DEVELOPING'))
      .thenBlocked('approval not recorded')
  })

  it('allows transition when guard passes', () => {
    spec
      .given([...eventsToPlanningState(), approvalRecorded()])
      .when((w) => w.transitionTo('DEVELOPING'))
      .thenPassed()
  })
})
```

### workflow-adapter.spec.ts

Test rehydrate parsing and error on unknown events:

```typescript
import { WorkflowAdapter } from './workflow-adapter.js'
import { makeDeps, sessionStarted, transitioned } from './workflow-test-fixtures.js'

describe('WorkflowAdapter', () => {
  it('rehydrates from valid events', () => {
    const events = [sessionStarted(), transitioned('A', 'B')]
    const wf = WorkflowAdapter.rehydrate(events, makeDeps())
    expect(wf.getState().currentStateMachineState).toStrictEqual('B')
  })

  it('throws on unknown event type', () => {
    const events = [{ type: 'unknown-thing', at: '2026-01-01' }]
    expect(() => WorkflowAdapter.rehydrate(events, makeDeps()))
      .toThrow('Unknown event type')
  })
})
```

### hook-io.spec.ts and environment.spec.ts

Test parsing, error cases, and exit codes. See the existing repo's test files for patterns.

---

## Verification Checklist

After generating all files:

1. [ ] `pnpm install` succeeds
2. [ ] `pnpm typecheck` passes
3. [ ] `pnpm test` passes with 100% coverage
4. [ ] `pnpm lint` passes
5. [ ] `.claude-plugin/plugin.json` has correct name
6. [ ] `hooks/hooks.json` points to the right entry point
7. [ ] All state procedure files exist in `states/`
8. [ ] README explains installation and usage

## Reference

For the conceptual model behind workflow-as-code, see `docs/workflow-engine-guide.md` in the autonomous-claude-agent-team repository.

Library API surface:
- `@ntcoding/agentic-workflow-builder/dsl` — `pass()`, `fail()`, `PreconditionResult`, `WorkflowStateDefinition`, `WorkflowRegistry`, `GitInfo`, `TransitionContext`
- `@ntcoding/agentic-workflow-builder/engine` — `WorkflowEngine`, `RehydratableWorkflow`, `WorkflowFactory`, `WorkflowEngineDeps`, `BaseEvent`, `BaseEventSchema`, `WorkflowStateError`, `PrefixConfig`
- `@ntcoding/agentic-workflow-builder/event-store` — `createStore(dbPath)`
- `@ntcoding/agentic-workflow-builder/testing` — `workflowSpec(config)`, `SpecConfig`, `GivenPhase`

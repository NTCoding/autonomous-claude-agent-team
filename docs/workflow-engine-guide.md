# Defining your own development workflow

This project allows you to define software development workflows that your coding agents are forced to follow inside an interactive session. The workflows are defined in TypeScript so that they can be type safe, compile-time safe, and unit testable 

To create a workflow, you must work through 4 steps:

1. Define the states of your workflow state machine & basic registry
2. Create a state definition for each state describing rules and transitions
3. Create the worfklow class and implement commands
4. Write tests to verify workflow behaviour
5. Wire up your workflow to Claude Code or other AI agent

## Example workflow

Throughout this guide we'll build a simple 3-state code review workflow:

```
CODING ──> REVIEWING ──> DONE
```

Rules:
- While in CODING, `git commit` is blocked — the agent can write code but cannot commit until a review happens.
- The workflow cannot transition from CODING to REVIEWING unless the agent has signaled it is done writing code.
- DONE is a terminal state with no further transitions.

## 1. Define states and registry

You need three things: the names of your states, the data your workflow tracks, and a registry that maps each state name to its definition.

```typescript
// my-workflow-types.ts
import { z } from 'zod'
import type { WorkflowRegistry } from '@ntcoding/agentic-workflow-builder/dsl'

// State names
export const STATE_NAMES = ['PLANNING', 'DEVELOPING', 'DONE'] as const
export type StateName = (typeof STATE_NAMES)[number]

// WorkflowState: all the data your workflow tracks across its lifetime
// currentStateMachineState: which node in the state machine the workflow is currently at
export type WorkflowState = {
  currentStateMachineState: string
  codingDone: boolean
}

// What the workflow data looks like before anything has happened
export const EMPTY_WORKFLOW: WorkflowState = {
  currentStateMachineState: 'CODING',
  codingDone: false,
}

// Registry — filled in during step 2
export const REGISTRY: WorkflowRegistry<WorkflowState, StateName> = {
  PLANNING: planningState,
  DEVELOPING: developingState,
  DONE: doneState,
}
```

## 2. Create state definitions

Each state definition declares: which states it can transition to, which operations are allowed, and optional guards that must pass before leaving.

```typescript
// states/planning.ts
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowStateDefinition } from '@ntcoding/agentic-workflow-builder/dsl'
import type { WorkflowState, StateName } from '../my-workflow-types.js'

export const planningState: WorkflowStateDefinition<WorkflowState, StateName> = {
  canTransitionTo: ['DEVELOPING'],
  allowedWorkflowOperations: ['approve'],
  agentInstructions: 'states/planning.md',
  emoji: '📝',
  transitionGuard: (ctx) => {
    if (!ctx.state.approved) return fail('Must be approved before developing.')
    return pass()
  },
}
```

A terminal state with no transitions or operations:

```typescript
// states/done.ts
export const doneState: WorkflowStateDefinition<WorkflowState, StateName> = {
  canTransitionTo: [],
  allowedWorkflowOperations: [],
  agentInstructions: 'states/done.md',
  emoji: '✅',
}
```

Guards receive a `TransitionContext` with: the current state, git info, PR check status, and the from/to state names.

Other options on a state definition:
- `onEntry` — modify state when entering (e.g. reset fields for a new iteration)
- `forbidden: { write: true }` — block file writes in this state
- `allowForbidden: { bash: ['git checkout'] }` — exempt specific commands from global bash restrictions

## 3. Create the workflow class and implement commands

Start with the workflow class itself — a method that does something and records what happened.

```typescript
// my-workflow.ts
import { pass, fail } from '@ntcoding/agentic-workflow-builder/dsl'
import type { PreconditionResult } from '@ntcoding/agentic-workflow-builder/dsl'

export class MyWorkflow {
  private state: WorkflowState
  private pendingEvents: MyEvent[] = []

  constructor(state: WorkflowState) { this.state = state }

  signalCodingDone(): PreconditionResult {
    if (this.state.codingDone) return fail('Already signaled done.')
    this.append({ type: 'coding-done-signaled', at: new Date().toISOString() })
    return pass()
  }

  private append(event: MyEvent): void {
    this.pendingEvents = [...this.pendingEvents, event]
    this.state = applyEvent(this.state, event)
  }
}
```

That's the pattern: check preconditions, record an event, update state. Every command follows this shape.

Now you need the two pieces that support it — **events** and a **fold**.

Events are facts about what happened. Each one has a `type` and `at` timestamp:

```typescript
// my-events.ts
import { z } from 'zod'
import { BaseEventSchema } from '@ntcoding/agentic-workflow-builder/engine'

export const MyEventSchema = z.discriminatedUnion('type', [
  BaseEventSchema.extend({ type: z.literal('session-started') }),
  BaseEventSchema.extend({ type: z.literal('coding-done-signaled') }),
  BaseEventSchema.extend({ type: z.literal('transitioned'), from: z.string(), to: z.string() }),
])
export type MyEvent = z.infer<typeof MyEventSchema>
```

The fold replays events into `WorkflowState`. The engine calls this on every request to rebuild the current state from the event history:

```typescript
// my-fold.ts
export function applyEvent(state: WorkflowState, event: MyEvent): WorkflowState {
  switch (event.type) {
    case 'session-started': return state
    case 'coding-done-signaled': return { ...state, codingDone: true }
    case 'transitioned': return { ...state, currentStateMachineState: event.to }
  }
}

export function applyEvents(events: readonly MyEvent[]): WorkflowState {
  return events.reduce(applyEvent, EMPTY_WORKFLOW)
}
```

Finally, the workflow class needs to implement `RehydratableWorkflow<WorkflowState>` so the engine can drive it. This adds a few required methods alongside your domain commands:

```typescript
// my-workflow.ts (full version)
import type { RehydratableWorkflow } from '@ntcoding/agentic-workflow-builder/engine'

export class MyWorkflow implements RehydratableWorkflow<WorkflowState> {
  private state: WorkflowState
  private pendingEvents: MyEvent[] = []

  constructor(state: WorkflowState) { this.state = state }

  // --- Required by the engine ---
  getState(): WorkflowState { return this.state }
  getPendingEvents(): readonly MyEvent[] { return this.pendingEvents }
  getAgentInstructions(pluginRoot: string): string {
    return `${pluginRoot}/${REGISTRY[parseStateName(this.state.currentStateMachineState)].agentInstructions}`
  }
  startSession(): void {
    this.append({ type: 'session-started', at: new Date().toISOString() })
  }
  verifyIdentity(_transcriptPath: string): PreconditionResult {
    return pass()
  }
  transitionTo(target: string): PreconditionResult {
    const from = parseStateName(this.state.currentStateMachineState)
    const to = parseStateName(target)
    const def = REGISTRY[from]
    if (!def.canTransitionTo.includes(to)) {
      return fail(`Cannot transition from ${from} to ${to}.`)
    }
    if (def.transitionGuard) {
      const guard = def.transitionGuard({ state: this.state, from, to, gitInfo: /* injected */, prChecksPass: false })
      if (!guard.pass) return guard
    }
    this.append({ type: 'transitioned', at: new Date().toISOString(), from, to: target })
    return pass()
  }

  // --- Your domain commands ---
  signalCodingDone(): PreconditionResult {
    if (this.state.codingDone) return fail('Already signaled done.')
    this.append({ type: 'coding-done-signaled', at: new Date().toISOString() })
    return pass()
  }

  private append(event: MyEvent): void {
    this.pendingEvents = [...this.pendingEvents, event]
    this.state = applyEvent(this.state, event)
  }
}
```

> **Observation:** The engine also needs a factory to create and rehydrate your workflow. This is mostly mechanical boilerplate — see `WorkflowAdapter` in the existing codebase for the pattern.

## 4. Write tests to verify workflow behaviour

The fold is pure and easy to test directly. The workflow class operations can be tested by calling them and checking the resulting state and pending events.

```typescript
import { describe, it, expect } from 'vitest'
import { applyEvents } from './my-fold.js'
import { MyWorkflow } from './my-workflow.js'
import { EMPTY_WORKFLOW } from './my-workflow-types.js'

describe('fold', () => {
  it('applies approved event', () => {
    const state = applyEvents([
      { type: 'session-started', at: '2025-01-01' },
      { type: 'approved', at: '2025-01-01' },
    ])
    expect(state.approved).toBe(true)
  })
})

describe('workflow', () => {
  it('blocks transition when not approved', () => {
    const w = new MyWorkflow(EMPTY_WORKFLOW)
    const result = w.transitionTo('DEVELOPING')
    expect(result.pass).toBe(false)
  })

  it('allows transition after approval', () => {
    const w = new MyWorkflow({ ...EMPTY_WORKFLOW, approved: true })
    const result = w.transitionTo('DEVELOPING')
    expect(result.pass).toBe(true)
  })
})
```

## 5. Wire up your workflow to Claude Code

Claude Code calls your workflow through **hooks** — shell commands that run automatically when the agent does things (starts a session, uses a tool, etc.). Your workflow script reads JSON from stdin, runs the check, and returns an exit code.

### hooks.json

Register your script for the hook events you care about:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/src/my-workflow.ts", "timeout": 30 }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/src/my-workflow.ts", "timeout": 30 }] }]
  }
}
```

Claude Code calls the same script for every hook event. The script reads stdin to find out which event fired and what the agent is trying to do.

### The entrypoint script

The script reads JSON from stdin, runs the workflow engine, and communicates back via exit codes and stdout:

```typescript
// my-entrypoint.ts
import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'

const stdin = fs.readFileSync(0, 'utf-8')
const input = JSON.parse(stdin)
// input contains: session_id, hook_event_name, tool_name, tool_input, etc.

const engine = new WorkflowEngine(MyAdapter, engineDeps, workflowDeps)

if (input.hook_event_name === 'SessionStart') {
  engine.startSession(input.session_id)
  process.exit(0) // 0 = allow
}

if (input.hook_event_name === 'PreToolUse') {
  // Example: block git commit while in CODING state
  const result = engine.transaction(input.session_id, 'check-tool', (w) =>
    w.checkBashAllowed(input.tool_name, input.tool_input.command ?? '')
  )
  if (result.type === 'blocked') {
    // Tell Claude Code to deny the tool use, with a reason
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.output,
      },
    }))
    process.exit(2) // 2 = block
  }
  process.exit(0) // 0 = allow
}
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Allow — the agent can proceed |
| `2`  | Block — the agent's action is denied, stdout contains the reason |
| `1`  | Error — something went wrong in the script itself |

### CLI commands

Agents also call your workflow directly via CLI for explicit operations like transitions:

```bash
# Agent runs this command to transition the workflow
npx tsx src/my-workflow.ts transition REVIEWING

# Agent records a fact
npx tsx src/my-workflow.ts signal-coding-done
```

The same script handles both modes: no args = hook mode (reads stdin), args = CLI mode (parses command + arguments).

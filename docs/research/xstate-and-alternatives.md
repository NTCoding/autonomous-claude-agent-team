## XState v5 and TypeScript Alternatives

### 1. XState v5

**What it is**: The leading JavaScript/TypeScript statechart library, implementing the W3C SCXML statecharts specification. v5 is a complete rewrite with first-class TypeScript support. ~30k GitHub stars, actively maintained by Stately (funded company).

**How it models state machines**:
- Machines defined declaratively with `createMachine({ ... })` specifying states, transitions, context, guards, actions
- Supports hierarchical (nested) states, parallel states, history states -- full statecharts
- Context is the "extended state" (analogous to `WorkflowState`)
- Events trigger transitions; guards gate them; actions execute side effects

**Mapping to the current system**:

| Current System | XState v5 Equivalent |
|---|---|
| `WORKFLOW_REGISTRY` | `states: { ... }` in machine config |
| `canTransitionTo` | `on: { EVENT: 'TARGET' }` transitions |
| `transitionGuard` | `guard:` on transitions |
| `onEntry` | `entry:` actions |
| `allowedWorkflowOperations` | Events that specific states respond to |
| `WorkflowState` (context) | `context` |
| `applyEvent` fold function | `assign()` action |
| `BLOCKED` universal escape | History state (elegant) |

**Guards**: XState v5 guards are functions `({ context, event }) => boolean` attached to transitions. Named guards can be provided at creation and overridden during testing. Maps cleanly to current `transitionGuard`, but XState guards are per-transition, not per-state.

**Event sourcing / event history**: XState does NOT natively support event sourcing. It maintains current state + context. You would need to manually replay events through the machine to rehydrate. `machine.transition(state, event)` is pure, making replay possible but not ergonomic.

**Testing**: Highly testable:
- `machine.transition(state, event)` is pure
- `@xstate/test` supports model-based testing (generates paths through the machine)
- Guards and actions can be mocked/overridden
- 100% coverage achievable but requires discipline around action side effects

**TypeScript experience**: Built TypeScript-first. Machine types are inferred. The `setup()` API provides explicit typing points. Complex type inference can increase compile times.

**What would be gained**:
- Visual editor (Stately Studio)
- Statechart features: hierarchical states, parallel states, history states
- History states for BLOCKED (replace manual `preBlockedState`)
- Model-based testing via `@xstate/test`
- Large community, extensive docs

**What would be lost**:
- Event sourcing not native; custom persistence layer needed
- Permission enforcement (bash/write/read blocking) has no natural equivalent
- The generic `WorkflowEngine<T>` pattern is more flexible
- Observation events (idle-checked, write-checked) are awkward in XState
- The declarative `WorkflowStateDefinition` with `allowedWorkflowOperations`, `forbidden`, `allowForbidden` is more domain-specific

**Verdict**: XState is the strongest general-purpose alternative. Statechart features (especially history states for BLOCKED) would genuinely improve the model. But event-sourcing and permission enforcement would need custom code on top. You'd trade ~750 lines of custom code for ~200 lines of XState config + ~300-400 lines of custom persistence/permission code. Similar total complexity. Value proposition strongest if the state machine grows more complex.

### 2. Inngest

**What it is**: Durable execution engine for TypeScript. "Temporal for serverless." Step functions with automatic retry, event-driven workflows. ~3k GitHub stars.

**Could it model the state machine?**: Fundamentally a workflow/orchestration tool, not a state machine library. The current system is not a long-running process -- it is request/response (CLI call in, result out). Inngest is designed for background workflows.

**Verdict: Poor fit.** Solves a different problem (durable background workflow execution). The system is synchronous, in-process. Inngest would add infrastructure overhead without addressing core patterns (guards, permissions, event-sourced state).

### 3. Restate

**What it is**: Durable execution engine with virtual objects. Built in Rust, SDKs for TypeScript, Java, Kotlin, Go, Python. ~2023, BUSL license.

**Virtual Objects**: Keyed entities with durable state and exclusive access. State is key-value pairs. Requires running the Restate server.

**Could it model the state machine?**: A virtual object keyed by session ID could hold state. Exclusive access gives serialization for free. But state is mutable key-value, not event-sourced.

**Verdict: Poor fit.** Like Inngest, solves distributed durability problems that don't exist here. Requires running their server. The system is single-process, single-user, file-backed.

### 4. Robot (robot3)

**What it is**: Minimal (~1KB) finite state machine library. ~1.8k GitHub stars. Functional API, immutable state transitions.

**How it works**: `state()`, `transition()`, `guard()`, `reduce()`, `invoke()` are composable functions. `reduce()` updates context (similar to fold). Immutable: `machine.transition(currentState, event)` returns new state.

**Verdict: Marginal fit.** Charming for simple UI state machines but lacks depth. No TypeScript support worth mentioning, no event sourcing, no statecharts, barely maintained. The current custom engine is already a better version of what Robot provides.

### Comparative Summary

| Criterion | Current Custom | XState v5 | Inngest | Restate | Robot3 |
|---|---|---|---|---|---|
| State machine model | Custom registry + guards | Full statecharts | Not a state machine | Not a state machine | Basic FSM |
| Event sourcing | Native (fold) | Manual (possible) | No | No (journal-based) | No |
| Guards | Per-state | Per-transition, first-class | N/A | Manual | Per-transition |
| TypeScript | Excellent (Zod + generics) | Excellent (inferred) | Good | Good | Weak |
| Testing (100%) | Pure functions, trivial | Pure transitions + mocks | Requires test harness | Requires test context | Pure transitions |
| Infrastructure | None (SQLite file) | None (in-process) | Server required | Server (Docker) | None (in-process) |
| Permission enforcement | Built-in | Custom layer needed | Custom layer needed | Custom layer needed | Custom layer needed |
| Observation events | Native (no-op for audit) | Awkward | Logging only | Logging only | No |
| Community | N/A | 30k stars, funded | Growing, ~3k | New, ~2k | ~1.8k, dormant |
| BLOCKED with auto-return | Manual (preBlockedState) | History state (elegant) | N/A | Manual | Manual |

### Recommendation

XState v5 is the only alternative worth serious consideration, and even then the case is not clear-cut.

**For XState**: History states for BLOCKED, visual editor (Stately Studio), model-based testing, community maintenance, nested/parallel states if the machine grows.

**Against XState**: Event sourcing is the core architectural decision and XState doesn't provide it. Permission enforcement remains custom. The custom engine is only 164 lines. The generic `WorkflowEngine<T>` is cleaner. Zero dependencies currently. Test coverage is trivially achievable.

**Bottom line**: The custom engine is well-designed for this use case. XState is worth revisiting if the state machine grows significantly (nested/parallel states) or visual editing via Stately Studio is desired.

### Sources

- [XState v5 Documentation](https://stately.ai/docs/xstate)
- [Stately Studio](https://stately.ai/studio)
- [XState GitHub](https://github.com/statelyai/xstate)
- [@xstate/test](https://stately.ai/docs/xstate-test)
- [Inngest Documentation](https://www.inngest.com/docs)
- [Restate Documentation](https://docs.restate.dev/)
- [Robot3 GitHub](https://github.com/matthewp/robot)

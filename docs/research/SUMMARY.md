# Workflow Technology Research Summary

**Date**: March 2026
**Scope**: Evaluate alternative technologies for implementing the event-sourced state machine that orchestrates AI coding agents in this repository.

## What We're Replacing (or Not)

The current system is a ~750-line TypeScript event-sourced state machine acting as a Claude Code plugin. Its defining characteristics:

1. **Event sourcing** — events folded via pure `applyEvent()` to derive state; full audit trail
2. **11-state FSM** — SPAWN, PLANNING, DEVELOPING, REVIEWING, COMMITTING, CR_REVIEW, PR_CREATION, FEEDBACK, COMPLETE, BLOCKED, RESPAWN
3. **Real-time hook interception** — intercepts every Claude Code tool call via stdin, enforces per-state permissions synchronously, returns allow/block exit codes
4. **Agent lifecycle management** — deterministic register/deregister/idle blocking
5. **Zero infrastructure** — runs in-process, persists to local SQLite
6. **100% test coverage** via pure function unit tests

## Individual Research Files

| Technology | File | Type |
|---|---|---|
| Mastra.ai | [mastra-ai.md](./mastra-ai.md) | TypeScript AI agent framework |
| Temporal.io | [temporal-io.md](./temporal-io.md) | Durable execution platform |
| Embabel | [embabel.md](./embabel.md) | JVM AI agent framework (GOAP) |
| cc-wf-studio | [cc-wf-studio.md](./cc-wf-studio.md) | VS Code visual workflow designer |
| pi.dev | [pi-dev.md](./pi-dev.md) | Terminal coding agent |
| XState + alternatives | [xstate-and-alternatives.md](./xstate-and-alternatives.md) | TS state machines (XState, Inngest, Restate, Robot3) |
| Cross-language | [cross-language-alternatives.md](./cross-language-alternatives.md) | Elixir/OTP, Rust, Python, Go |

## Verdicts at a Glance

### Not a fit (solve different problems)

| Technology | Why Not |
|---|---|
| **Mastra.ai** | Step-based DAG orchestrator for LLM pipelines. No state machine, no event sourcing, no hook interception. Architectural mismatch — task orchestration vs. state enforcement. |
| **Embabel** | GOAP dynamic planning (the opposite of hardcoded FSM). JVM-only. No event sourcing. Pre-1.0. Fascinating architecture but antithetical to "P1: Strict, not flexible." |
| **cc-wf-studio** | Visual workflow *designer*, not an *engine*. Outputs static markdown files. No runtime, no state machine, no permissions. Different layer entirely. |
| **pi.dev** | Terminal coding agent (competitor to Claude Code). Could be *orchestrated by* this system, but cannot replace it. No workflow engine. |
| **Inngest** | Durable background workflow execution. Wrong interaction model — the system is synchronous CLI, not background jobs. |
| **Restate** | Distributed durable execution with virtual objects. Requires running a server. Solves problems this system doesn't have. |
| **Robot3** | Minimal FSM library. Weak TypeScript, no event sourcing, barely maintained. The custom engine is already better. |
| **Python frameworks** (LangGraph, CrewAI, Prefect) | All assume the framework IS the agent. This system supervises agents it doesn't control. GIL, poor CLI distribution, no event sourcing. |
| **Go** | Solid CLI tooling but no paradigm leap. Would be rewriting the same engine in different syntax. |

### Worth serious consideration (but still not recommended for the current system)

| Technology | What It Offers | Why Not Right Now |
|---|---|---|
| **XState v5** | History states (elegant BLOCKED handling), visual editor (Stately Studio), model-based testing, 30k stars | No native event sourcing. Permission enforcement layer remains custom. Similar total complexity (~500 lines XState + ~400 custom vs. ~750 custom). Worth revisiting if the state machine grows to need nested/parallel states. |
| **Temporal.io** | Built-in event sourcing via replay, signals for agent communication, Activities for side effects, enterprise-grade observability | Requires running a server (non-starter for a zero-dependency CLI plugin). Hook interception latency over gRPC. Integration tests replace pure unit tests. Solves distributed problems that don't exist here. |
| **Elixir/OTP** | `:gen_statem` purpose-built for FSMs. OTP supervision trees are native agent lifecycle. Commanded for mature event sourcing. BEAM concurrency model is exactly this problem domain. | Language switch (steep learning curve). CLI distribution via Burrito (30-50MB). Claude Code plugin constraint means a TypeScript adapter remains regardless. |
| **Rust** | Typestate pattern catches invalid transitions at compile time. Sub-millisecond CLI startup. Tiny static binaries. `cqrs-es` for event sourcing. | Slow development velocity (borrow checker, compile times). Agent lifecycle is manual. Same TypeScript adapter constraint. |

## Decision Matrix

| Criterion | Custom (current) | XState | Temporal | Elixir/OTP | Rust |
|---|---|---|---|---|---|
| Event sourcing | Native (fold) | Manual | Built-in (replay) | Commanded | cqrs-es |
| State machine | Custom FSM | Statecharts | Implicit (program counter) | :gen_statem | Typestate (compile-time) |
| Hook interception | Native (in-process) | Custom layer | Latency problem (gRPC) | Custom layer + adapter | Custom layer + adapter |
| Permission enforcement | Built-in DSL | Custom layer | Custom | Custom | Custom + compile-time |
| Agent lifecycle | Custom events | Custom | Child workflows | **Native (OTP)** | Custom (tokio) |
| Infrastructure | Zero (SQLite) | Zero | Server required | Zero (Burrito) | Zero |
| Testing (100% coverage) | Pure functions | Pure + model-based | Integration tests | In-memory event store | cargo test |
| Dev velocity | Fast | Fast | Moderate | Moderate | Slow |
| Claude Code compat | Native | Native | Adapter needed | Adapter needed | Adapter needed |

## Recommendation

### For the current system: Keep the custom engine

None of the evaluated technologies provide a compelling replacement for the specific combination of event sourcing + hook interception + per-state permission enforcement + zero infrastructure + 100% pure-function test coverage. The custom engine is ~750 lines, fully tested, and IS the spec.

### Ideas worth stealing

- **XState's history states** for the BLOCKED/pre-blocked-state pattern — could be adopted as a concept without adopting XState itself
- **Temporal's implicit-state model** ("where the code is paused = current state") — worth considering for workflow readability
- **Embabel's GOAP planning** — not for this system, but intellectually interesting for future systems where the path isn't predetermined
- **Rust's typestate pattern** — the concept of making invalid transitions a compile-time error is powerful, even if implemented differently in TypeScript

### If building a v2 or hosted version

- **Elixir/OTP** if agent supervision should be a runtime primitive (the BEAM was built for exactly this)
- **Temporal** if it becomes a hosted service orchestrating many concurrent sessions across machines
- **Rust** if CLI performance and binary distribution become top priorities

## The Claude Code Plugin Constraint

Any non-TypeScript implementation requires a TypeScript adapter shim that remains in the plugin. This adds process spawn overhead on every tool call interception and IPC serialization. This constraint diminishes the advantage of switching languages, because the hot path (hook interception on every tool call) benefits most from being in-process.

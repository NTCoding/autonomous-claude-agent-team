# Cross-Language Alternatives for AI Agent Team Orchestration

## 1. Elixir/Erlang (BEAM VM)

### GenStateMachine / :gen_statem

`:gen_statem` is an OTP behaviour for implementing state machines as long-lived Erlang processes. The Elixir wrapper `GenStateMachine` provides an idiomatic interface. You define states as atoms, events as messages, and transitions as callback return values. It supports two callback modes: `:handle_event_function` (single callback for all state/event combos) and `:state_functions` (one function per state). It natively supports state timeouts, event postponement, and internal events.

Fit for this system: Very high. The 11-state workflow maps directly to `:gen_statem` states. Transition guards become pattern-match clauses. Permission checking becomes a middleware layer in the event handler.

### Broadway

Broadway is a concurrent multi-stage data ingestion pipeline built on GenStage. Designed for high-throughput stream processing (SQS, Kafka, RabbitMQ), not for stateful workflow logic.

Fit: Low. The problem is not data ingestion; it is stateful orchestration.

### OTP Supervision Trees

Each coding agent could be modeled as a child process under a `DynamicSupervisor`:
- Automatic restart on crash
- Lifecycle hooks: `init/1`, `terminate/2`
- Transient processes for agents that should not restart on normal exit
- Graceful shutdown in reverse start order

The current system manually tracks agent lifecycle in the event-sourced state. In Elixir, the BEAM runtime handles this natively. You would not need to model "agent-spawned" or "agent-idle" as domain events -- the process registry and supervisor would be the source of truth.

Fit: Excellent. Agent lifecycle management is a first-class BEAM concern.

### BEAM VM Concurrency Model

Lightweight processes (~2KB each) with preemptive scheduling and per-process garbage collection. Isolated memory, no shared state, no locks. Communication via message passing. Key advantages:
- Soft real-time guarantees
- Hot code reloading
- Location transparency (distributable)
- "Let it crash" philosophy

The architecture the current system manually implements is essentially what the BEAM provides out of the box.

### Event Sourcing: Commanded

Commanded is the mature Elixir CQRS/ES framework. Each aggregate is a GenServer that loads event streams, applies events to build state, handles commands, and emits new events. Includes:
- Event store (PostgreSQL via EventStore library)
- Process managers (long-running sagas)
- Projections (read models from events)
- Testing: In-memory event store, `append_to_stream/3` for setup, strong consistency mode

Commanded's testing approach is conceptually identical to the current system: append events to set up state, dispatch commands, assert on emitted events.

Fit: Very high. 1:1 mapping to `WorkflowState` + `applyEvents()`.

### CLI Distribution

Elixir CLI tools: escripts (require Erlang runtime) or Burrito binaries (self-contained, ~30-50MB with embedded BEAM runtime).

### Overall Elixir Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| State machine fit | Excellent | `:gen_statem` purpose-built |
| Event sourcing fit | Excellent | Commanded mature and tested |
| Agent lifecycle | Excellent | OTP supervision trees unmatched |
| Concurrency model | Excellent | Natural for multi-agent |
| CLI distribution | Moderate | Burrito works, binaries are large |
| Testing | Excellent | ExUnit + in-memory event store |
| Learning curve | Steep | Functional programming + OTP |
| Ecosystem maturity | High | Battle-tested in telecom/fintech |

**Verdict**: Elixir/OTP is the strongest paradigmatic fit. The BEAM was designed for "multiple concurrent stateful agents supervised by a central coordinator." The main cost is the language switch and CLI distribution.

## 2. Rust

### State Machine Crates

**Statig**: Hierarchical state machines with `#[state_machine]` proc macro. States are enum variants, supports entry/exit actions, superstates. The hierarchical model maps to BLOCKED as a universal escape (superstate pattern).

**Typestate pattern**: Encodes state in the type system. Invalid transitions become compile-time errors. A workflow in `Developing` state is a different type than `Committing` -- you literally cannot call `commit()` on `Developing`. Zero runtime overhead.

### Event Sourcing

**cqrs-es**: Lightweight CQRS/ES framework. `Aggregate` trait with `handle()` (command -> events) and `apply()` (event -> state). Testing via `given(events).when(command).then_expect(events)`.

### Performance

Rust CLI tools start in microseconds (vs ~100ms Node.js). Single static binary, 2-10MB. Significant advantage for a tool invoked on every tool call via stdin hooks.

### Type Safety

- Exhaustive matching: adding a state forces handling everywhere
- Typestate: invalid transitions are compile-time errors
- No null/undefined: `Option<T>` explicit
- Ownership: state cannot be accidentally shared/mutated

### Trade-offs

Major downside is development velocity. Borrow checker means slower iteration. Compilation is slow. Agent spawning needs tokio + `std::process::Command`.

### Overall Rust Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| State machine fit | Very Good | Typestate is compile-time safe |
| Event sourcing fit | Good | cqrs-es works but less mature |
| Agent lifecycle | Moderate | Manual via tokio |
| Concurrency | Good | async/await + channels |
| CLI distribution | Excellent | Single binary, microsecond startup |
| Testing | Good | cargo test, slower compile |
| Learning curve | Very Steep | Borrow checker, lifetimes |
| Ecosystem maturity | Moderate | ES/workflow crates younger |

**Verdict**: Best if CLI performance and binary distribution are top priorities. Typestate offers compile-time guarantees no other language can match. Cost is development velocity.

## 3. Python

### LangGraph

Models agent workflows as directed graphs. Nodes are functions, edges define flow (conditional routing, parallel branches), state is a shared TypedDict/Pydantic model. v1.0 in late 2025, default runtime for LangChain agents.

**Fit**: Partial. LangGraph assumes it IS the agent. The current system supervises agents it does not control. Fundamental paradigm mismatch.

### CrewAI

Role-based model with Agents, Tasks, and Crews. Sequential and hierarchical workflows.

**Fit**: Poor. "Define roles and let LLMs figure out collaboration" is the anti-thesis of "P1: Strict, not flexible."

### Prefect

Python workflow orchestration with `@flow` and `@task` decorators. Dynamic DAGs, retries, caching, timeouts.

**Fit**: Moderate. Designed for data pipeline orchestration (ETL, ML training). Latency too high for synchronous stdin hooks.

### Overall Python Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| State machine fit | Moderate | LangGraph has graphs, paradigm mismatch |
| Event sourcing fit | Low | No native ES |
| Agent lifecycle | Moderate | Frameworks manage their own agents |
| Concurrency | Low | GIL limits true parallelism |
| CLI distribution | Poor | Requires Python or pyinstaller (large) |
| Testing | Good | pytest excellent, ES testing DIY |
| Learning curve | Low | Widely known |
| Ecosystem maturity | High for AI, Low for ES | Great LLM tooling, weak workflow |

**Verdict**: Python's AI agent frameworks solve a fundamentally different problem -- they assume the framework controls the agent. The current system supervises external agents. GIL, CLI distribution, and lack of event sourcing make Python the weakest candidate.

## 4. Go

### Temporal Go SDK

Workflow-as-code with automatic durability. Strong conceptual fit but requires running a Temporal Server -- significant infrastructure dependency for a standalone CLI tool.

### FSM Libraries

**looplab/fsm**: Standard Go FSM library (667 importers). Event-driven transitions with callbacks. Could model the state machine, but Go has no mature event sourcing framework.

### Overall Go Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| State machine fit | Good | looplab/fsm solid |
| Event sourcing fit | Moderate (Temporal) / Low | Standalone needs custom |
| Agent lifecycle | Good | goroutines + context |
| Concurrency | Very Good | goroutines well-understood |
| CLI distribution | Excellent | Single binary, fast startup |
| Testing | Very Good | go test |
| Learning curve | Moderate | Simple but verbose |
| Ecosystem maturity | Moderate | Good general, thin ES |

**Verdict**: Solid pragmatic choice for CLI tools but no paradigm leap. You'd rewrite the same engine in different syntax.

## Comparative Summary

| Criterion | Current (TS) | Elixir | Rust | Python | Go |
|-----------|-------------|--------|------|--------|-----|
| State machine paradigm | Good | Excellent | Excellent | Moderate | Good |
| Event sourcing | Good (custom) | Excellent (Commanded) | Good (cqrs-es) | Poor | Poor |
| Agent lifecycle | Custom code | Native (OTP) | Custom code | Framework-managed | Custom code |
| CLI startup | ~100ms | ~200ms (Burrito) | ~1ms | ~300ms+ | ~5ms |
| Binary distribution | Needs Node.js | Burrito (30-50MB) | Static (2-10MB) | pyinstaller (50MB+) | Static (5-15MB) |
| Dev velocity | Fast | Moderate | Slow | Fast | Moderate |
| Type safety | Good (Zod) | Moderate (dialyzer) | Exceptional | Moderate (mypy) | Moderate |
| Claude Code compat | Native | Needs adapter | Needs adapter | Needs adapter | Needs adapter |

## The Claude Code Plugin Constraint

Any non-TypeScript implementation needs to be called as an external process from a TypeScript plugin adapter. This adds process spawn overhead on every tool call, IPC serialization, and a TypeScript shim that remains regardless. This somewhat diminishes the advantage of switching languages.

## Recommendations

**Paradigm purity**: Elixir. The BEAM's process model, OTP supervision, `:gen_statem`, and Commanded solve every aspect with mature primitives.

**CLI performance and type safety**: Rust. Sub-millisecond startup, tiny binaries, compile-time state transition validation.

**Pragmatism**: Stay with TypeScript. The custom engine works. Switching languages introduces rewrite risk for marginal gains. The Claude Code plugin constraint means TypeScript remains regardless.

## Sources

- [GenStateMachine docs](https://hexdocs.pm/gen_state_machine/GenStateMachine.html)
- [Commanded on GitHub](https://github.com/commanded/commanded)
- [OTP Supervisors - Elixir School](https://elixirschool.com/en/lessons/advanced/otp_supervisors)
- [Burrito - Standalone Elixir Binaries](https://github.com/burrito-elixir/burrito)
- [Statig on GitHub](https://github.com/mdeloof/statig)
- [CQRS and Event Sourcing in Rust](https://doc.rust-cqrs.org/)
- [The Typestate Pattern in Rust](https://cliffle.com/blog/rust-typestate/)
- [LangGraph](https://www.langchain.com/langgraph)
- [Temporal Go SDK](https://github.com/temporalio/sdk-go)
- [looplab/fsm](https://github.com/looplab/fsm)
- [Process-Based Concurrency: BEAM and OTP](https://variantsystems.io/blog/beam-otp-process-concurrency)

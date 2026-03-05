# Embabel Research Report

## What is Embabel?

Embabel (pronounced em-BAY-bel) is an open-source AI agent framework for the JVM, created by Rod Johnson -- the creator of the Spring Framework. It is written in Kotlin (with first-class Java support), built on top of Spring AI, and licensed under Apache 2.0. The latest documented version is 0.3.1. The GitHub repo (`embabel/embabel-agent`) has approximately 292 stars and 64 contributors.

## Core Problem It Solves

Embabel provides a higher-level abstraction for building AI agent workflows on the JVM. Rather than forcing developers into Python-centric tooling, it lets enterprise teams build agent systems directly in the JVM ecosystem with strong typing, compile-time safety, and seamless integration with existing business logic.

## Core Concepts and Architecture

### 1. Actions, Goals, and Conditions

- Actions (`@Action`): Methods that perform work. They take typed inputs from the Blackboard and return typed outputs. They have preconditions and postconditions, often inferred automatically from method signatures.
- Goals (`@AchievesGoal`): What an agent is trying to achieve. Goals have preconditions that must be satisfied.
- Conditions (`@Condition`): Boolean checks evaluated before executing actions or determining goal achievement. Must be side-effect-free.

### 2. Planning via GOAP (Goal-Oriented Action Planning)

This is the most distinctive architectural feature. Instead of a hardcoded state machine or sequential pipeline, Embabel uses GOAP -- an AI planning algorithm from game AI -- to dynamically compute a path from the current state to the desired goal. It uses A* search over the action/condition graph. The system replans after every action (OODA loop), meaning it adapts to new information and can compose known steps in novel orders never explicitly programmed.

### 3. The Blackboard (shared state)

State is managed through the Blackboard pattern -- a shared, typed, ordered, append-only data store. Objects are indexed by type; once added they are immutable (new versions can be appended). Actions read inputs from and write outputs to the Blackboard automatically.

### 4. Multiple Planner Types

- GOAP Planner: Default. Deterministic, explainable A* planning.
- Utility AI Planner: Chooses actions based on dynamic utility scores.
- Supervisor Planner: LLM-orchestrated sub-agent coordination.
- State Machine: If an action returns a `@State` type, control goes to a state machine, but its ultimate return is passed back to the GOAP planner.

All planner types share the identical programming model.

### 5. MCP Integration

Embabel can both consume and publish MCP tools. Tool groups use filter lambdas to control which tools are exposed, with configurable permissions.

### 6. Testing

- Actions are plain methods on POJOs -- fully unit-testable
- All LLM interactions go through `PromptRunner`, which can be mocked
- Domain logic is independently testable
- A dedicated testing library supports prompt testing

## What Language(s)?

Kotlin (primary), Java (first-class citizen). An idiomatic TypeScript version has been discussed as a future goal but does not exist today.

## How Mature Is It?

- Version: 0.3.1 (pre-1.0)
- GitHub: ~292 stars, 64 contributors
- Active development through 2025-2026
- Creator credibility: Rod Johnson (Spring Framework creator) gives it significant weight
- Coverage: Articles on Baeldung, InfoQ, The New Stack; talks at GOTO conferences

## Comparison to the Current System

| Aspect | Current System | Embabel |
|---|---|---|
| Language | TypeScript | Kotlin/Java (JVM only) |
| State Model | Event-sourced: events folded through pure function | Blackboard pattern: typed append-only shared memory |
| Workflow Model | Explicit state machine with 11 states | GOAP dynamic planning (no explicit state machine, though one mode exists) |
| Transition Guards | Preconditions before state changes | Conditions on actions and goals, often inferred from types |
| Event Sourcing | Full event log as primary audit trail | No native event sourcing. Blackboard is append-only but not an event log |
| Hook Interception | Intercepts Claude Code tool calls | MCP tool filtering; no external hook interception |
| Agent Lifecycle | Explicit register/deregister, idle blocking | Spring component scanning; no lifecycle management like idle blocking |
| Permission Enforcement | Per-state | Per-tool-group; not per-state |
| Determinism | Fully deterministic hardcoded state machine | GOAP is deterministic (A*) but path is dynamically computed |
| Test Coverage | 100% enforced | Designed for testability; actions are POJOs; PromptRunner is mockable |
| Maturity | Custom-built, production-hardened | Pre-1.0 (v0.3.1), general-purpose framework |

## Key Architectural Differences

### 1. Philosophy: Hardcoded vs. Dynamic

The current system is a hardcoded workflow ("strict, not flexible" -- P1). Embabel's GOAP planner is the opposite: it dynamically discovers paths to goals. This is a fundamental mismatch.

### 2. Event Sourcing

The event-sourced design (events as source of truth, state derived by folding) has no equivalent in Embabel. The Blackboard is append-only but has no fold/replay mechanism.

### 3. Language Barrier

Embabel is JVM-only. Adopting it would require rewriting in Kotlin or Java.

### 4. Hook Interception

No equivalent for intercepting external AI tool calls at the hook level.

### 5. State Machine Support

A state machine mode exists (via `@State` return types), but it's one component within GOAP, not the primary orchestration mechanism.

## Conclusion

Embabel is an impressive framework with strong architectural ideas (GOAP planning, typed Blackboard, multiple planner types). However, it is not a natural fit for replacing the current system:

1. Wrong language: JVM-only, no TypeScript support.
2. Wrong paradigm: Dynamic planning vs. explicitly hardcoded state machine.
3. No event sourcing.
4. No hook interception.
5. Pre-1.0 maturity.

If building a new JVM-based agent system from scratch where dynamic planning and typed domain models are priorities, Embabel would be worth serious evaluation. For this specific use case -- a TypeScript event-sourced state machine that intercepts Claude Code hooks -- it is not a suitable replacement.

## Sources

- [GitHub - embabel/embabel-agent](https://github.com/embabel/embabel-agent)
- [Embabel Agent Framework User Guide (v0.3.1)](https://docs.embabel.com/embabel-agent/guide/0.3.1/)
- [Embabel: A New Agent Platform For the JVM - Rod Johnson](https://medium.com/@springrod/embabel-a-new-agent-platform-for-the-jvm-1c83402e0014)
- [AI for your Gen AI: How and Why Embabel Plans - Rod Johnson](https://medium.com/@springrod/ai-for-your-gen-ai-how-and-why-embabel-plans-3930244218f6)
- [Creating an AI Agent in Java Using Embabel - Baeldung](https://www.baeldung.com/java-embabel-agent-framework)
- [Introducing Embabel - InfoQ](https://www.infoq.com/news/2025/06/introducing-embabel-ai-agent/)
- [Meet Embabel - The New Stack](https://thenewstack.io/meet-embabel-a-framework-for-building-ai-agents-with-java/)
- [Build Better Agents: Embabel vs LangGraph - Rod Johnson](https://medium.com/@springrod/build-better-agents-in-java-vs-python-embabel-vs-langgraph-f7951a0d855c)
- [Yes, You Can Unit Test Gen AI Applications - Rod Johnson](https://medium.com/@springrod/yes-you-can-unit-test-gen-ai-applications-9b2838bb0f45)

# pi.dev Research

**Date:** 2026-03-05
**Status:** Complete
**Verdict:** Not a workflow engine. Not a replacement for the current system. Different problem domain entirely.

---

## What is pi.dev?

pi.dev is the website for **Pi**, a minimal terminal-based AI coding agent created by **Mario Zechner** (creator of the libGDX game framework). Pi is a coding harness -- a lightweight, extensible foundation for interacting with LLMs in the terminal. It is not a workflow engine, state machine framework, or agent orchestration system.

Pi is the engine that powers **OpenClaw**, which gained 145,000+ GitHub stars rapidly and became one of the fastest-growing open-source AI projects.

- **Repository:** [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- **Website:** [pi.dev](https://pi.dev/) (also reachable at shittycodingagent.ai)
- **License:** MIT
- **Language:** TypeScript (monorepo using npm workspaces with lockstep versioning)
- **GitHub Stars:** ~20,100
- **Forks:** ~2,100
- **Latest Release:** v0.56.1 (2026-03-05, actively maintained)
- **Creator:** Mario Zechner (@badlogic)

## Core Concepts

### Philosophy

Pi's philosophy is radical minimalism and extensibility. The core coding agent ships with only **4 tools** (read, write, edit, bash) and a system prompt under 1,000 tokens. The idea is that what you leave out matters more than what you put in. Pi adapts to your workflows rather than dictating them.

This is the opposite of our system's philosophy (P1: "Strict, not flexible. This is a hardcoded workflow").

### Package Architecture

Pi lives in a TypeScript monorepo (`pi-mono`) with layered packages:

| Package | Purpose |
|---|---|
| `@mariozechner/pi-ai` | Unified multi-provider LLM API (Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, etc.) |
| `@mariozechner/pi-agent-core` | Agent runtime with tool calling, state management, message queuing |
| `@mariozechner/pi-coding-agent` | Full coding agent CLI with built-in tools, session persistence, extensibility |
| `@mariozechner/pi-tui` | Terminal UI library with differential rendering |

### Operating Modes

Pi runs in four modes:
1. **Interactive** -- standard terminal REPL
2. **Print/JSON** -- one-shot output
3. **RPC** -- headless operation via JSON protocol over stdin/stdout (for embedding in other apps/IDEs)
4. **SDK** -- direct programmatic embedding via `createAgentSession()`

### Extension System

Extensions are TypeScript modules that can hook into the agent lifecycle:

- **`tool_call`** -- intercept or gate tool invocations (permission gates, blocking dangerous commands)
- **`context`** -- rewrite messages before the LLM sees them
- **`session_before_compact`** -- customize summarization
- **`before_agent_start`** -- inject context or modify the prompt
- **`session_start` / `session_switch`** -- react to session changes
- **`pi.setBashSpawnHook()`** -- intercept and modify bash commands before execution

Extensions are auto-discovered from `~/.pi/agent/hooks/*.ts` (global) and `<cwd>/.pi/hooks/*.ts` (project).

### Session Persistence

Sessions are stored as **JSONL files** with a tree structure (each entry has `id` and `parentId`). This is append-only and crash-safe. It supports in-place branching without creating new files. Pi also has a `/tree` command for navigating session history as a non-linear tree.

This is NOT event sourcing in the domain-modeling sense. It is conversation history persistence -- recording LLM messages, tool calls, and tool results. There is no concept of domain events, aggregate roots, or state derived by folding events through a pure function.

## How It Handles Multi-Agent Coordination

Pi does **not** have built-in multi-agent orchestration. The documented approaches are:

1. **Spawn pi instances via tmux** -- ask pi to run itself in a tmux session
2. **Extensions** -- one pi agent can send prompts to another via an extension
3. **SDK embedding** -- programmatically create multiple `AgentSession` instances
4. **OpenClaw integration** -- OpenClaw runs multiple agents inside one Gateway process with persistent agents and sub-agents

For deterministic workflow orchestration, the OpenClaw ecosystem uses **Lobster** -- a separate YAML-based workflow engine that sequences steps, routes data as JSON, and provides approval gates. Lobster handles the plumbing while LLMs do the creative work.

## What Pi Does NOT Provide

- **No state machine** -- no defined states, transitions, guards, or preconditions
- **No event sourcing** -- JSONL session logs are conversation history, not domain events folded into state
- **No workflow engine** -- no defined workflow with stages, transition rules, or enforcement
- **No permission enforcement per state** -- permission gates exist but are static (not state-dependent)
- **No hook interception of external tool calls** -- pi intercepts its own 4 tools, not arbitrary Claude Code tool calls
- **No agent lifecycle management** -- no register/deregister, no idle blocking, no agent identity tracking
- **No side effects on transitions** -- no onEntry hooks tied to state transitions
- **No CLI + hook dual interface** -- pi is purely a CLI coding agent, not a plugin for another system

## Comparison to Current System

| Capability | Current System | Pi |
|---|---|---|
| **Primary purpose** | Workflow engine orchestrating AI coding agents through defined states | Terminal coding agent for interactive LLM-powered coding |
| **Architecture** | Event-sourced state machine with 11 states | Agent loop with 4 tools and extension hooks |
| **State management** | Domain events folded through pure function to derive state | AgentState object tracking conversation, model config, tool registry |
| **Persistence** | SQLite event store | JSONL conversation logs |
| **Workflow enforcement** | Transition guards, preconditions, state-dependent permissions | None (by design -- "adapts to your workflow") |
| **Multi-agent** | Agent lifecycle management (register, deregister, idle blocking) | Not built-in; spawn via tmux, SDK, or extensions |
| **Hook system** | Intercepts Claude Code tool calls to enforce permissions per state | Extension events for tool_call interception (static, not state-dependent) |
| **Permission model** | State-dependent: blocks writes, bash commands, source reads depending on current state | Static permission gates via extensions |
| **Side effects** | onEntry hooks trigger external calls (GitHub, git, ESLint) on state transitions | No state transitions exist |
| **Philosophy** | P1: Strict, not flexible. Hardcoded workflow. | Aggressively extensible. Adapts to your workflow. |
| **Language** | TypeScript | TypeScript |
| **Test coverage** | 100% enforced | Not specified |

## Related: "PI Workflow" (Unrelated Project)

During research, a separate project called "PI Workflow" appeared in search results. This is a **Python** framework for building durable, fault-tolerant, long-running business processes. It does use event-driven, event-sourced architecture with workflow replay and state reconstruction. However, it is a completely separate project with no relation to pi.dev/pi-mono. It is a Python framework, not a TypeScript one, and targets generic business process automation rather than AI agent orchestration.

## Related: Lobster (OpenClaw's Workflow Engine)

Lobster is a CLI-driven workflow runtime used within the OpenClaw ecosystem (which uses Pi as its agent engine). It provides:

- YAML-based pipeline definition
- Deterministic sequential step execution
- Data flows as JSON between steps
- Approval gates that pause side effects
- Resume tokens for paused workflows
- Sub-workflow steps with loop support

Lobster is closer to what our system does than Pi itself, but it is:
- YAML-defined (not code-is-the-spec)
- A generic pipeline runner (not an event-sourced state machine)
- Separate from Pi (part of the OpenClaw ecosystem)
- Not event-sourced (steps run sequentially, no event log folding)

## Verdict

**Pi is not a replacement or alternative for the current system.** They solve fundamentally different problems:

- **Pi** is a coding agent -- it gives an LLM tools to read, write, edit, and run bash commands in a terminal. It is what our system *orchestrates* (similar to how our system orchestrates Claude Code instances).
- **Our system** is a workflow engine that manages the lifecycle of multiple AI coding agents through a defined state machine with event sourcing, transition guards, and state-dependent permissions.

Pi could theoretically be used *as the agent* that our workflow engine orchestrates (replacing Claude Code), but it cannot replace the workflow engine itself. Pi's extension system provides some hooks (tool_call interception, permission gates) but these are static and agent-scoped, not workflow-state-dependent.

The closest thing in the Pi/OpenClaw ecosystem to our workflow engine is **Lobster**, but Lobster is a YAML pipeline runner without event sourcing, not a typed state machine with domain events.

**Bottom line:** Pi and our system are complementary, not competitive. Pi is an agent harness; our system is an agent orchestrator.

## Sources

- [pi.dev](https://pi.dev/)
- [badlogic/pi-mono on GitHub](https://github.com/badlogic/pi-mono)
- [Pi coding agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [Pi extensions documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi hooks documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/hooks.md)
- [Permission gate extension example](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts)
- [Pi RPC documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [What I learned building an opinionated and minimal coding agent (Mario Zechner)](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [How to Build a Custom Agent Framework with PI (Nader Dabit)](https://nader.substack.com/p/how-to-build-a-custom-agent-framework)
- [Pi: The Minimal Agent Within OpenClaw (Armin Ronacher)](https://lucumr.pocoo.org/2026/1/31/pi/)
- [PI Agent Revolution (Atal Upadhyay)](https://atalupadhyay.wordpress.com/2026/02/24/pi-agent-revolution-building-customizable-open-source-ai-coding-agents-that-outperform-claude-code/)
- [Pi vs Claude Code comparison](https://github.com/disler/pi-vs-claude-code)
- [Pi on Hacker News](https://news.ycombinator.com/item?id=47143754)
- [Pi agent-core on DeepWiki](https://deepwiki.com/badlogic/pi-mono/3-@mariozechnerpi-agent-core)
- [Agent Loop and State Management on DeepWiki](https://deepwiki.com/badlogic/pi-mono/3.1-agent-and-transport-layer)
- [Deterministic Multi-Agent Dev Pipeline with Lobster](https://dev.to/ggondim/how-i-built-a-deterministic-multi-agent-dev-pipeline-inside-openclaw-and-contributed-a-missing-4ool)
- [Pi vs Claude Agent SDK comparison (Agentlas)](https://agentlas.pro/compare/pi-vs-claude-agent-sdk/)
- [@mariozechner/pi-coding-agent on npm](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- [awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent)

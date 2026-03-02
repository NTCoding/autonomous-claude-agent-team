# autonomous-claude-agent-team

A claude code plugin that provides a team of AI agents that implement features autonomously. They are driven by a workflow engine that is written in real code (type safe with 100% test coverage).

## Build Commands

```bash
pnpm install       # install deps + auto-builds
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint src/
pnpm test          # vitest run --coverage (100% required)
```

## Project Structure

```plaintext
src/
├── autonomous-claude-agent-team-workflow.ts  ← Thin CLI/hook adapter (public)
├── workflow-dsl/          ← Generic DSL types (PreconditionResult, state definitions)
├── workflow-engine/       ← WorkflowEngine<T>, state schema, event log, identity rules, output formatting
├── workflow-definition/   ← Workflow aggregate root, state registry, state definitions, engine adapter
└── infra/                 ← All I/O: filesystem, git, GitHub, stdin, linter
```

See [docs/architecture.md](docs/architecture.md) for dependency rules and module privacy.

## Design Principles

### P1: Strict, not flexible

This is a hardcoded workflow for producing high-quality code. Not a configurable framework. No configuration interfaces, no plugin system, no generic abstractions. The code IS the spec.

### P2: Single entry point, private internals

ALL operations go through one public module: `autonomous-claude-agent-team-workflow.ts`. No agent ever touches the state file directly. Every operation has a meaningful workflow name — not generic CRUD.

### P6: Code guides, prompts assist

Every command output tells the agent exactly what happened and what to do next. The code is the primary guidance mechanism. Agent prompts are secondary — they provide principles and context, but the actual "what to do now" comes from command output.

## Debugging

State is persisted to `/tmp/feature-team-state-<SESSION_ID>.json`. To inspect it:

```bash
# Find the state file (SESSION_ID comes from the lead's CLAUDE_SESSION_ID env var)
cat /tmp/feature-team-state-<SESSION_ID>.json | jq .

# Check current state and active agents
cat /tmp/feature-team-state-<SESSION_ID>.json | jq '{state, activeAgents, iteration}'

# Inspect the full event log to trace what happened
cat /tmp/feature-team-state-<SESSION_ID>.json | jq '.eventLog[]'

# List all feature team state files
ls /tmp/feature-team-state-*.json
```

The `eventLog` array records every operation in order (`op`, `at`, `detail`). It is the primary audit trail — check it first when something goes wrong.

## Versioning

Every change requires a version bump in both `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`. Use semantic versioning (patch for fixes, minor for new behavior, major for breaking changes).

## State Procedure Convention

Every requirement in a state procedure file (`states/*.md`) MUST be a `- [ ]` checklist item. The lead agent creates a TaskCreate entry for each checklist item when entering a state. Prose paragraphs are ignored — if it's not a checklist item, it won't be tracked.

## Vitest Configuration

Claude may **not** modify `vitest.config.mts` coverage exclusion rules without explicit user permission.

## Coding Standards

- 100% test coverage enforced — thresholds set to 100% for all metrics (P3)
- No `any`, no `as` (except `as const`), no `let`; Zod schemas at all boundaries (P4)
- Fail fast: invalid state → error with context; never fallback silently (P5)
- [docs/conventions/testing.md](docs/conventions/testing.md)
- [docs/conventions/software-design.md](docs/conventions/software-design.md)
- [docs/conventions/anti-patterns.md](docs/conventions/anti-patterns.md)
- [docs/conventions/standard-patterns.md](docs/conventions/standard-patterns.md)
- [docs/conventions/review-feedback-checks.md](docs/conventions/review-feedback-checks.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/testing-strategy.md](docs/testing-strategy.md)

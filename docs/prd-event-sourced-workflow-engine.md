# PRD: Event-Sourced Workflow Engine

## Context

Feedback from [Yves Reynhout](https://bsky.app/profile/yves.reynhout.be) on the current architecture. The current engine persists a **state snapshot** to `/tmp/feature-team-state-<SESSION_ID>.json` with an append-only `eventLog[]` embedded in the state object. Events are recorded but never replayed — they're purely an audit trail. State is the source of truth.

Yves' core insight: **invert this relationship**. Events become the source of truth. State is derived by folding events.

## Problem

1. **Dual source of truth** — State fields and eventLog both exist in the same JSON blob. They can drift. State is authoritative; events are decorative.
2. **No cross-session persistence** — State lives in `/tmp/`, scoped to a single session. No querying, no analytics, no learning across sessions.
3. **Forced transitions** — The state machine requires a state change for every meaningful action. Sometimes the right response is "record this, stay in the same state." Current model forces transitions or drops information.
4. **Inputs and outputs not unified** — The event log records workflow operations (inputs) but not agent outputs (instructions given, decisions made). Can't replay the full picture.

## Proposal

### 1. Events as source of truth (fold state from events)

Remove the state snapshot. Derive `WorkflowState` by reducing the event stream:

```
fold(events) → WorkflowState
```

- `readState()` becomes: read events → fold → return derived state
- `writeState()` becomes: append new event(s)
- The `WorkflowState` type remains unchanged — it's now a projection, not stored data
- Zod validation moves to event schemas, not the state blob

**Key benefit**: Single source of truth. State can never drift from events. Any bug in state derivation is fixable by replaying.

### 2. Persistent event store (SQLite)

Replace `/tmp/*.json` with SQLite (one DB per session, or one DB with session partitioning):

```sql
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  op TEXT NOT NULL,
  at TEXT NOT NULL,
  detail JSON
);
```

- **Why SQLite over DuckDB**: SQLite is zero-dependency in Node.js (via `better-sqlite3`), battle-tested, sufficient for this use case. DuckDB adds value if analytics queries become complex later.
- **Cross-session queries**: `SELECT * FROM events WHERE op = 'review-rejected'` across all sessions → learn patterns.
- **Feed back to AI**: Export event streams as context for improving agent behavior.

### 3. Record both inputs AND outputs

Expand event vocabulary to capture the full workflow picture:

**Inputs** (already recorded):
- `record-issue`, `signal-done`, `review-approved`, etc.

**Outputs** (new):
- `agent-instruction-issued` — what instructions were given to an agent
- `transition-decision` — why a transition was chosen (not just that it happened)
- `precondition-evaluated` — guard results, even when passing
- `output-rendered` — what CLI output was shown

**Benefit**: Full replay of the workflow session — both what happened and what the system did about it. Enables feeding complete session streams back to AI for improvement.

### 4. Self-transitions (record without state change)

Allow events that don't trigger state transitions:

- Current: every `eventLog` entry lives inside a state mutation
- Proposed: events can be appended independently of state changes
- A "self-transition" records a message and stays in the same state

Example: In DEVELOPING, the developer reports partial progress. No state change needed, but the event is recorded for the audit trail and future AI analysis.

## Open Questions

1. **Migration path** — Big bang or incremental? Could keep JSON state as a cache/optimization while events become authoritative.
2. **Event schema versioning** — How to handle schema evolution as events change over time?
3. **Performance** — Folding from scratch on every read acceptable? Or maintain a snapshot cache? (Likely fine for <1000 events per session.)
4. **Scope** — Full event sourcing or just the storage change first? Could phase this: (a) SQLite storage, (b) event folding, (c) input/output recording, (d) self-transitions.

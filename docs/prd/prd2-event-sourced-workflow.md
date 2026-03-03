# PRD: Event-Sourced Workflow Engine

**Status:** Draft

## Context

Feedback from [Yves Reynhout](https://bsky.app/profile/yves.reynhout.be) on the current architecture. The current engine persists a **state snapshot** to `/tmp/feature-team-state-<SESSION_ID>.json` with an append-only `eventLog[]` embedded in the state object. Events are recorded but never replayed — they're purely an audit trail. State is the source of truth.

Yves' core insight: **invert this relationship**. Events become the source of truth. State is derived by folding events.

## Prerequisites

PRD1 (Declarative Workflow DSL) must be complete — all phases done, zero dependency-cruiser violations — before PRD2 implementation begins. PRD1 and PRD2 both redesign the `WorkflowEngine` method surface and the `RehydratableWorkflow` interface. Working both in parallel guarantees merge conflicts. Specifically: PRD1's Phase 5 creates `workflow-engine/domain/engine.ts` and Phase 6 rewrites the entrypoint — both are prerequisites for the engine simplification in this PRD.

## 1. Problem

### P1: Dual source of truth

State fields and `eventLog[]` both exist in the same JSON blob. They can drift. State is authoritative; events are decorative.

```
Current state file (simplified):
{
  "state": "DEVELOPING",
  "iteration": 2,
  "githubIssue": 42,
  "iterations": [
    { "task": "Add auth", "developerDone": true, "reviewApproved": true, ... },
    { "task": "Add tests", "developerDone": false, ... }
  ],
  "eventLog": [                          ← decorative audit trail
    { "op": "init", "at": "..." },
    { "op": "record-issue", "at": "...", "detail": { "issueNumber": 42 } },
    { "op": "transition", "at": "...", "detail": { "from": "SPAWN", "to": "PLANNING" } },
    ...
  ]
}
```

If a bug mutates `githubIssue` without recording an event, the event log and state disagree. No way to detect or recover.

### P2: No cross-session persistence

State lives in `/tmp/`, scoped to a single session. No querying, no analytics, no learning across sessions. A reboot wipes all history.

### P3: Silent operations

Not every interaction with the workflow aggregate produces an event. Hook checks (`checkWriteAllowed`, `checkBashAllowed`, `checkIdleAllowed`) execute and return results but leave no trace. If an agent was blocked from writing 15 times in RESPAWN, the event stream shows nothing.

```
Current: hook check → PreconditionResult (no event recorded)

What actually happened during a session:

  10:00  checkBashAllowed("git commit")     → blocked    ← invisible
  10:00  checkBashAllowed("git commit")     → blocked    ← invisible
  10:01  checkWriteAllowed("Edit", "src/")  → blocked    ← invisible
  10:02  checkIdleAllowed("developer-1")    → blocked    ← invisible
  ...
  10:15  signalDone()                       → recorded   ← visible
```

This matters for process improvement. If agents repeatedly attempt blocked operations, that's a signal the instructions are unclear or the workflow design has a friction point.

### P4: Bloated engine

`WorkflowEngine` has accumulated workflow-specific operations that don't belong in a generic engine:

```
WorkflowEngine methods (current):
├── startSession()      ← session lifecycle (belongs)
├── transaction()       ← generic execution (belongs)
├── transition()        ← state management (belongs)
├── hasSession()        ← session query (belongs)
├── persistSessionId()  ← session lifecycle (belongs)
│
├── registerAgent()     ← workflow-specific (doesn't belong)
├── shutDown()          ← workflow-specific (doesn't belong)
├── checkIdleAllowed()  ← workflow-specific (doesn't belong)
├── runLint()           ← workflow-specific (doesn't belong)
└── verifyIdentity()    ← workflow-specific (doesn't belong)
```

`registerAgent` is the clearest example: it bypasses `transaction()` entirely, has its own rehydrate-persist cycle, and returns agent-specific context. It's a workflow command masquerading as an engine feature.

The engine should be a generic session lifecycle manager. Everything else goes through `transaction()`.

### P5: Forced transitions

The state machine requires a state change for every meaningful action. Sometimes the right response is "record this, stay in the same state." Current model forces transitions or drops information.

Example: In DEVELOPING, the developer reports partial progress. No state change needed, but the event should be recorded for the audit trail and future analysis.

### P6: No process analytics

Completed sessions disappear. There's no way to answer:
- How long did the average session take?
- Which state consumes the most time?
- How often do reviews get rejected?
- What are the common reasons for entering BLOCKED?
- Are iterations getting shorter over time (learning) or longer (scope creep)?

## 2. Design Principles

### DP1: Events are the single source of truth

State is a projection derived by folding events. If state and events disagree, events win — because state is computed, not stored.

```
fold(events) → WorkflowState
```

### DP2: Every interaction is observable

Every invocation on the workflow aggregate produces an event — commands, queries, transitions, hook checks. No silent operations. If it happened, the event stream proves it.

**Trade-off:** More events = larger store, more noise. We accept this because observability enables process improvement, and events can be filtered in queries. An unrecorded operation is an invisible failure mode.

### DP3: Engine has no knowledge of workflow-specific concepts

The engine manages sessions and executes transactions. It has zero imports from `workflow-definition/`. No method names reference domain concepts (agents, linting, PRs, reviews). All domain-specific operations go through `transaction()`. This is enforced by the dependency-cruiser rule `workflow-engine-module-privacy`.

This is a **dependency rule**, not a reuse promise. The engine is not designed for reuse with other workflows — it is designed to be free of coupling to this specific workflow. P1 (strict, not flexible) still applies.

**Trade-off:** Loses the convenience of dedicated engine methods like `registerAgent()`. Gain: operations have a consistent execution model, and the engine boundary is enforceable by tooling.

### DP4: Durable over ephemeral

SQLite replaces `/tmp/*.json`. Sessions survive reboots. Cross-session queries enable learning.

**Trade-off:** Adds a native dependency (`better-sqlite3`). We accept this because SQLite is battle-tested, zero-config, and the only viable embedded option for Node.js.

### DP5: Show, don't tell

Analytics and the session viewer exist to surface actionable insights from event data. The goal is not "display events" — it's "reveal patterns that improve the workflow."

## 3. What We're Building

### 3.1 Event-sourced workflow aggregate

Every method on the `Workflow` aggregate produces one or more events. State is derived by folding.

**Current model (mutate state, append event as side-effect):**

```typescript
recordIssue(issueNumber: number): PreconditionResult {
  this.checkOperationGate('record-issue')
  this.state = {
    ...this.state,
    githubIssue: issueNumber,                    // ← mutate state directly
    eventLog: [...this.state.eventLog,           // ← event is secondary
      createEventEntry('record-issue', this.deps.now(), { issueNumber })
    ]
  }
  return pass()
}
```

**Proposed model (produce events, derive state):**

```typescript
recordIssue(issueNumber: number): PreconditionResult {
  this.checkOperationGate('record-issue')
  this.append({ type: 'issue-recorded', issueNumber })    // ← event is primary
  return pass()
}

// State is derived:
// fold([..., { type: 'issue-recorded', issueNumber: 42 }])
//   → { ...state, githubIssue: 42 }
```

**The fold function — pure reducer:**

```typescript
function applyEvent(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  switch (event.type) {
    case 'session-started':
      return INITIAL_STATE

    case 'issue-recorded':
      return { ...state, githubIssue: event.issueNumber }

    case 'transitioned':
      return applyTransition(state, event.from, event.to)

    case 'agent-registered':
      return { ...state, activeAgents: [...state.activeAgents, event.agentName] }

    case 'iteration-task-assigned':
      return {
        ...state,
        iterations: [...state.iterations, {
          task: event.task,
          developerDone: false,
          reviewApproved: false,
          reviewRejected: false,
          // ...
        }]
      }

    case 'idle-checked':
    case 'write-checked':
    case 'bash-checked':
    case 'plugin-read-checked':
    case 'identity-verified':
    case 'context-requested':
    case 'journal-entry':
      return state    // ← observation events don't change state

    // ... one case per event type
  }
}

function fold(events: readonly WorkflowEvent[]): WorkflowState {
  return events.reduce(applyEvent, EMPTY_STATE)
}
```

**Event vocabulary — full list:**

Commands (mutate state):
```
session-started          { sessionId }
issue-recorded           { issueNumber }
branch-recorded          { branch }
plan-approval-recorded   { }
iteration-task-assigned  { task }
developer-done-signaled  { }
pr-recorded              { prNumber }
pr-created               { prNumber, title }
issue-checklist-appended { issueNumber, checklist }
iteration-ticked         { issueNumber }
review-approved          { }
review-rejected          { }
coderabbit-addressed     { }
coderabbit-ignored       { }
lint-ran                 { files, passed }
agent-registered         { agentName, agentId }
agent-shut-down          { agentName }
transitioned             { from, to }
```

Observations (don't mutate state, record every check):
```
idle-checked             { agentName, allowed, reason? }
write-checked            { tool, filePath, allowed, reason? }
bash-checked             { tool, command, allowed, reason? }
plugin-read-checked      { tool, path, allowed, reason? }
identity-verified        { passed, recovery? }
context-requested        { agentName }
journal-entry            { agentName, content }
```

Every hook check produces an event — passes and denials both. This means a SQLite write on every `PreToolUse` hook invocation. Accepted trade-off: full observability over performance. The event stream records exactly what every agent attempted, succeeded at, and was blocked from.

Every event carries `{ type, at }` plus its specific payload.

**onEntry effects as events:** Current state definitions have `onEntry` hooks that directly mutate `WorkflowState` (e.g., BLOCKED sets `preBlockedState`, DEVELOPING resets `developerDone` and captures `headCommit`). Under event sourcing, the `transitioned` event alone is insufficient — it doesn't carry the `onEntry` side-effects. Two approaches:

**Option A: Fat transition event.** The `transitioned` event carries all onEntry-derived fields:
```
transitioned  { from, to, preBlockedState?, iteration?, developingHeadCommit? }
```
The fold function for `transitioned` applies these fields directly. onEntry hooks become pure functions that enrich the event payload before it's appended.

**Option B: Separate state-initialization events.** After `transitioned`, the aggregate emits additional events:
```
transitioned                    { from: 'REVIEWING', to: 'BLOCKED' }
pre-blocked-state-recorded      { state: 'REVIEWING' }
```
The fold function processes them in sequence.

Recommend **Option A** — fewer events, simpler fold, and the transition is the semantic unit (entering BLOCKED *means* recording the pre-blocked state; they're not independent operations).

**Module placement:**

```
workflow-definition/domain/
├── fold.ts              ← applyEvent(), fold() — pure reducer over WorkflowEvent
├── workflow-events.ts   ← WorkflowEvent discriminated union type + Zod schema
├── workflow.ts          ← Workflow aggregate (appends events via this.append())
└── ...

workflow-engine/domain/
├── base-event.ts        ← BaseEvent type { type: string, at: string }
└── ...                     (engine handles BaseEvent[], doesn't know concrete types)
```

The `fold()` function lives in `workflow-definition/domain/fold.ts` because it switches on domain-specific event types (`issue-recorded`, `agent-registered`, etc.). The engine handles events as `BaseEvent[]` — it knows how to load, append, and pass them around, but never inspects their `type` field.

The `WorkflowFactory.rehydrate` signature changes:
```
Current:  rehydrate(state: WorkflowState, deps: WorkflowDeps): TWorkflow
Proposed: rehydrate(events: readonly BaseEvent[], deps: WorkflowDeps): TWorkflow
```

The concrete `WorkflowAdapter.rehydrate` implementation calls `fold(events as WorkflowEvent[])` to derive state, then constructs the `Workflow` with that state. The engine never calls `fold` directly.

**Test entry point preserved:** `Workflow.rehydrate(state: WorkflowState)` is kept as a convenience constructor for tests. This lets the 94 existing workflow aggregate tests continue to set up state directly without replaying event sequences. The production path (`rehydrateFromEvents`) calls `fold` → `rehydrate`. Both are tested.

### 3.2 Slim engine

Strip `WorkflowEngine` down to session lifecycle and generic transaction execution.

**Current engine surface (10 methods):**

```
startSession()       transaction()       transition()
registerAgent()      checkIdleAllowed()  shutDown()
runLint()            verifyIdentity()    persistSessionId()
hasSession()
```

**Proposed engine surface (5 methods):**

```
startSession()       transaction()       transition()
persistSessionId()   hasSession()
```

No `query()`. No distinction between "reads" and "writes." Every invocation produces events, every invocation goes through `transaction()`. The engine's job: load events → fold → execute lambda → persist new events.

```
Before:  engine.registerAgent(sessionId, agentType, agentId)
After:   engine.transaction(sessionId, 'register-agent',
           (w) => w.registerAgent(agentType, agentId))

Before:  engine.shutDown(sessionId, agentName)
After:   engine.transaction(sessionId, 'shut-down',
           (w) => w.shutDown(agentName))

Before:  engine.runLint(sessionId, files)
After:   engine.transaction(sessionId, 'run-lint',
           (w) => w.runLint(files))

Before:  engine.checkIdleAllowed(sessionId, agentName)
After:   engine.transaction(sessionId, 'check-idle',
           (w) => w.checkIdleAllowed(agentName))

Before:  engine.verifyIdentity(sessionId, transcriptPath)
After:   engine.transaction(sessionId, 'verify-identity',
           (w) => w.verifyIdentity(transcriptPath))
```

Everything is a transaction. Hook checks produce observation events. State-mutating commands produce state-changing events. The engine doesn't distinguish — it persists whatever events the workflow produces.

**`RehydratableWorkflow` interface simplification:**

```
Current:
  getState()
  getAgentInstructions()
  transitionTo()
  registerAgent()       ← remove
  checkIdleAllowed()    ← remove
  shutDown()            ← remove
  runLint()             ← remove

Proposed:
  getState()
  getAgentInstructions()
  transitionTo()
  getPendingEvents()    ← new: flush uncommitted events
```

The engine no longer knows what operations the workflow supports. It executes arbitrary `(workflow) => PreconditionResult` functions and persists whatever events the workflow accumulated during execution.

### 3.3 Persistent event store (SQLite)

Replace `/tmp/*.json` with SQLite:

```sql
PRAGMA journal_mode=WAL;    -- required: concurrent reads (viewer) + writes (hooks)

CREATE TABLE IF NOT EXISTS events (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type      TEXT NOT NULL,
  at        TEXT NOT NULL,
  payload   JSON NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
```

Schema creation is idempotent (`IF NOT EXISTS`). No migration tooling — schema changes are additive columns only, handled by code.

**Storage location:** `~/.claude/workflow-events.db` (single DB, all sessions).

**Why single DB over per-session files:**
- Cross-session queries without merging
- Single connection, simpler code
- Session isolation via `WHERE session_id = ?`

**Why `~/.claude/` over `/tmp/`:**
- Survives reboots
- User-scoped (not system-wide)
- Follows Claude Code convention for user data

**Why SQLite over other stores:**

| Option | Pros | Cons |
|--------|------|------|
| **SQLite** | Zero-config, battle-tested, `better-sqlite3` is synchronous (no async overhead), rich query language | Native dependency (pre-built binaries) |
| JSON files | Zero dependencies, current approach | No cross-session queries, no indexing, file-per-session sprawl |
| DuckDB | Analytical queries, columnar storage | Heavier dependency, overkill for <10K events |
| LevelDB | Fast writes, embedded | No SQL queries, poor for analytics |

Recommend **SQLite** — the query capability is essential for analytics, and `better-sqlite3` is the standard in the Node.js ecosystem.

**Read path:**
```
loadSession(sessionId):
  SELECT type, at, payload FROM events
  WHERE session_id = ? ORDER BY seq
  → fold(events) → WorkflowState
```

**Write path:**
```
appendEvents(sessionId, events):
  INSERT INTO events (session_id, type, at, payload)
  VALUES (?, ?, ?, ?)
  — one row per event, in a transaction
```

### 3.4 Process analytics command

A CLI command that queries the event store and surfaces actionable insights.

**Invocation:**

```bash
# Single session analysis
node dist/workflow.js analyze <session_id>

# Cross-session analysis (all sessions)
node dist/workflow.js analyze --all
```

**Single session output:**

```
Session: abc-123def
Duration: 2h 34m
Iterations: 3
Total events: 147

State Duration Breakdown
────────────────────────────────────────
SPAWN          2m   ██
PLANNING      12m   ████████
DEVELOPING  1h 22m  ███████████████████████████████████████████
REVIEWING     28m   █████████████
COMMITTING    14m   ██████
CR_REVIEW      8m   ████
PR_CREATION    3m   ██
FEEDBACK       5m   ███

Iteration Breakdown
────────────────────────────────────────
#1   45m  DEVELOPING(30m) → REVIEWING(10m) → COMMITTING(5m)
#2   55m  DEVELOPING(40m) → REVIEWING(5m) ⟲ rejected → DEVELOPING(10m)
#3   35m  DEVELOPING(20m) → REVIEWING(10m) → COMMITTING(5m)

Review Outcomes: 2 approved, 1 rejected (33% rejection rate)

Blocked Episodes
────────────────────────────────────────
DEVELOPING → BLOCKED  12m  "Tests failing, need user help"
REVIEWING  → BLOCKED   5m  "Merge conflict"

Hook Blocks (operations attempted but denied)
────────────────────────────────────────
write-checked (denied)   15x  (all in RESPAWN — agents attempting writes)
bash-checked (denied)     8x  (git commit in DEVELOPING — premature commits)
idle-checked (denied)     3x  (developer-1 trying to idle before signal-done)
```

**Cross-session output:**

```
Sessions: 15 (2024-11-01 to 2025-03-03)

Averages
────────────────────────────────────────
Duration:     1h 45m  (min: 32m, max: 4h 12m)
Iterations:   2.3     (min: 1, max: 5)
Events:       98      (min: 34, max: 247)

Time Distribution (avg)
────────────────────────────────────────
DEVELOPING   62%  ███████████████████████████████
REVIEWING    18%  █████████
COMMITTING    8%  ████
Other        12%  ██████

Aggregates
────────────────────────────────────────
Review rejection rate:     35%
Avg iterations to merge:   2.3
Most common block reason:  "Tests failing" (7 of 15 sessions)
Sessions with 4+ iterations: 2

Hook Block Hotspots
────────────────────────────────────────
write-checked (denied):  avg 12x/session  (RESPAWN state)
bash-checked (denied):   avg 6x/session   (git commit in non-COMMITTING)
→ Agents frequently attempt operations the workflow blocks.
  Consider: improving agent instructions for RESPAWN and DEVELOPING.
```

**Output format is fixed.** The sections shown above (header, state durations, iteration breakdown, review outcomes, blocked episodes, hook blocks for single-session; header, averages, time distribution, aggregates, hook block hotspots for cross-session) are the complete and exact output. New sections require a PRD amendment. Output is plaintext to stdout only — no JSON flag, no file output, no CSV export.

**Iteration boundaries** are derived from `iteration-task-assigned` events — each occurrence marks the start of a new iteration. Session start time is inferred from `MIN(at) WHERE session_id = ?`. Session end time is inferred from `MAX(at) WHERE session_id = ?`. Incomplete sessions (no terminal state) display `(in progress)` for duration.

### 3.5 Session viewer

A local web-based viewer for inspecting event streams visually. Served by a lightweight local HTTP server.

**Invocation:**

```bash
# View a specific session
node dist/workflow.js view <session_id>

# View session picker (all sessions)
node dist/workflow.js view
```

Opens `http://localhost:PORT` in the default browser.

**Session list view:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Workflow Session Viewer                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Session                Started          Duration  Iters  State         │
│  ─────────────────────  ───────────────  ────────  ─────  ──────────── │
│  abc-123def             2025-03-01 10:00  2h 34m     3    ✅ COMPLETE   │
│  def-456ghi             2025-02-28 14:30  1h 12m     2    ✅ COMPLETE   │
│  ghi-789jkl             2025-02-28 09:00  0h 45m     1    ⚠️ BLOCKED   │
│  jkl-012mno             2025-02-27 16:00  3h 01m     4    ✅ COMPLETE   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Session detail view:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Session: abc-123def                                                    │
│  Duration: 2h 34m  |  Iterations: 3  |  Events: 147                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  State Timeline                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ SPAWN      ██                                                      │ │
│  │ PLANNING   ████████                                                │ │
│  │ RESPAWN    ██          ██          ██                              │ │
│  │ DEVELOPING ██████████████  ████████████████████  ██████████        │ │
│  │ REVIEWING  ██████  ██████████  ██████                              │ │
│  │ COMMITTING ████                ████                                │ │
│  │ CR_REVIEW              ████████                                    │ │
│  │ PR_CREATION                                        ██              │ │
│  │ FEEDBACK                                           ████            │ │
│  │ COMPLETE                                               █           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ Iteration #1 (45m) ──────────────────────────────────────────────┐ │
│  │ 10:02  🔄 transitioned        SPAWN → PLANNING                    │ │
│  │ 10:02     issue-recorded      #42                                  │ │
│  │ 10:14  ⚪ transitioned        PLANNING → RESPAWN                   │ │
│  │ 10:14     iteration-task-assigned  "Implement auth endpoint"       │ │
│  │ 10:16  🔨 transitioned        RESPAWN → DEVELOPING                │ │
│  │ 10:16     write-checked       Edit src/auth.ts → allowed          │ │
│  │ 10:45     developer-done-signaled                                  │ │
│  │ 10:46  📋 transitioned        DEVELOPING → REVIEWING              │ │
│  │ 10:56     review-approved                                          │ │
│  │ 10:57  💾 transitioned        REVIEWING → COMMITTING              │ │
│  │ 11:01     iteration-ticked    #42                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ Iteration #2 (55m) ──────────────────────────────────────────────┐ │
│  │ 11:01  🔄 transitioned        COMMITTING → RESPAWN                │ │
│  │ 11:01     iteration-task-assigned  "Add integration tests"        │ │
│  │ 11:03  🔨 transitioned        RESPAWN → DEVELOPING                │ │
│  │ 11:43     developer-done-signaled                                  │ │
│  │ 11:44  📋 transitioned        DEVELOPING → REVIEWING              │ │
│  │ 11:48     review-rejected                                          │ │
│  │ 11:48  🔨 transitioned        REVIEWING → DEVELOPING              │ │
│  │ 11:56     developer-done-signaled                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Summary                                                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ State         Entries  Total Time  Avg Time                        │ │
│  │ DEVELOPING       4       1h 22m     20m 30s                       │ │
│  │ REVIEWING        3         28m       9m 20s                       │ │
│  │ COMMITTING       2         14m       7m 00s                       │ │
│  │ PLANNING         1         12m      12m 00s                       │ │
│  │ ...                                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation approach:** Static HTML/CSS/JS bundle served by a minimal Node.js HTTP server. The server exposes a JSON API over the SQLite store. No framework dependencies — vanilla HTML.

```
view command:
  1. Start HTTP server on random available port
  2. Expose /api/sessions and /api/sessions/:id/events
  3. Serve static HTML/CSS/JS from plugin assets
  4. Open browser to http://localhost:PORT
  5. Server auto-closes after 30 minutes of inactivity
```

### 3.6 Agent context from event stream

When a developer or reviewer is spawned, they need to understand what's happened in the session so far. A new command reads the event stream and produces a formatted context summary.

**Invocation:**

```bash
# Called by the SubagentStart hook or on-demand by agents
node dist/workflow.js event-context
```

**Output:**

```
Session: abc-123def
Current state: 🔨 DEVELOPING (iteration #2)
GitHub Issue: #42
Feature Branch: feature/add-auth

Iteration History:
  #1: "Implement auth endpoint"
    ✅ Developer completed → Reviewer approved → Committed
    Journal (developer-1): Implemented JWT auth with middleware.
      Added route protection for /api/* endpoints. 100% coverage.

  #2: "Add integration tests" (in progress)
    🔨 Development in progress

Active Agents: lead, developer-1, reviewer-1

Recent Events (last 15):
  11:03  🔨 transitioned         RESPAWN → DEVELOPING
  11:01     iteration-task-assigned  "Add integration tests"
  11:01  🔄 transitioned         COMMITTING → RESPAWN
  11:00     journal-entry        developer-1: "Implemented JWT auth..."
  10:59     agent-shut-down      developer-1
  10:57  💾 transitioned         REVIEWING → COMMITTING
  10:56     review-approved
  ...
```

This is a workflow command routed through `transaction()` — it produces a `context-requested { agentName }` observation event, recording that the agent asked for context.

The output includes journal entries from previous iterations, giving the new agent a handoff summary of what was done and what remains.

### 3.7 Agent journal entries

Before an agent shuts down, it writes a journal entry summarizing what it accomplished. This entry is stored in the event stream and surfaced in the event-context for the next agent.

**Invocation:**

```bash
node dist/workflow.js write-journal <agent-name> <content>

# Example:
node dist/workflow.js write-journal developer-1 "Implemented auth endpoint with JWT tokens. \
  Added middleware for route protection. Tests passing at 100% coverage. \
  Left TODO: refresh token rotation needs a separate iteration."
```

This produces a `journal-entry { agentName, content }` observation event. It doesn't mutate workflow state — the journal lives in the event stream only.

**Where journals appear:**
- In `event-context` output — journal entries are shown under the iteration they were written in
- In the session viewer — journal entries appear as events in the timeline
- In the analytics command — journal entries are counted but content is not analyzed

**Agent workflow integration:** The `shut-down` command should be preceded by `write-journal`. The shut-down procedure files (`states/*.md`) instruct agents to journal before exiting. The workflow does NOT enforce this as a precondition — it's guidance, not a gate. An agent that shuts down without journaling loses that context for the next agent, but the workflow continues.

## 4. What We're NOT Building

- **Generic event sourcing framework** — This is purpose-built for the workflow aggregate. No reusable event store library, no projections framework, no event bus.
- **Real-time streaming** — Events are written and read synchronously. No WebSocket streaming, no pub/sub, no change data capture.
- **CQRS read models** — A single fold function derives state. No separate read-optimized projections, no materialized views, no denormalized query tables.
- **Event schema migration tooling** — Schema evolution handled by code (upcasting in the fold function), not by database migration scripts.
- **Multi-user collaboration** — One session = one lead agent. No concurrent writes, no conflict resolution, no event merging.
- **Remote analytics dashboard** — The viewer is local-only. No cloud hosting, no shared URLs, no authentication.
- **AI-powered analysis** — The analytics command produces deterministic output from queries. No LLM calls, no AI interpretation of patterns. (AI integration is a future feature that consumes the event data we're producing here.)
- **Event replay/reprocessing command** — No `workflow.js replay` command. Fold is used implicitly on every load, not as an explicit CLI operation.
- **Event export** — No `workflow.js export` command. Users can query SQLite directly (`sqlite3 ~/.claude/workflow-events.db`).
- **CLI event inspection** — No raw `workflow.js events <session_id>` dump command. The `event-context`, `analyze`, and viewer commands cover structured access to event data.
- **Session management** — No `workflow.js delete` or `workflow.js prune`. Sessions accumulate. Disk cleanup is the user's responsibility.
- **Viewer interactivity** — The viewer is a read-only display. No client-side filtering, search, sorting, or pagination. The page renders all returned data on load. Only interaction: clicking a session in the list view navigates to its detail view.

## 5. Success Criteria

1. **Single source of truth** — `WorkflowState` is derived by `fold(events)`. No state snapshot persisted. Test: persist events via the aggregate, call `fold()` independently, assert the result equals `workflow.getState()`.
2. **Complete observability** — Every method on the `Workflow` aggregate produces at least one event. Commands produce state-changing events. Hook checks produce observation events (both passes and denials). Test: enumerate all public methods, call each in valid state, assert `getPendingEvents().length > 0`.
3. **Engine is generic** — `WorkflowEngine` has no imports from `workflow-definition/`. Five methods only: `startSession`, `transaction`, `transition`, `persistSessionId`, `hasSession`. All domain operations go through `transaction()`. Test: `pnpm deps` passes with zero violations.
4. **Cross-session persistence** — Sessions survive reboots. Test: write a session, close DB, reopen DB, query, assert all events present.
5. **Analytics produces correct output** — Given a session with a known event sequence, `analyze` output contains: correct duration, correct iteration count, correct review rejection rate, correct hook denial counts. Test: insert known events into a test DB, run analyze, assert output matches expected values.
6. **Viewer serves session data** — `GET /api/sessions` returns JSON array of session summaries. `GET /api/sessions/:id/events` returns JSON array of events. Test: start server against a test DB, assert HTTP response shapes match Zod schemas.
7. **Behavioral regression safety** — All 94 existing workflow aggregate tests pass unchanged (via preserved `Workflow.rehydrate(WorkflowState)` entry point). No agent-visible behavior changes.
8. **New code coverage** — All new code (fold function, event store, analytics queries, HTTP server) has 100% test coverage. The fold function has per-event-type unit tests and a property test (run aggregate → serialize events → fold → assert equals `getState()`).

## 6. Decisions

### D1: Migration path — event store behind the same interface

The `readState`/`writeState` interface stays the same. Internally, the infra layer changes from "read/write JSON file" to "fold events from SQLite / append events to SQLite." The engine and workflow aggregate see `WorkflowState` as before. The storage mechanism is an infra concern.

### D2: Record every hook check

Every hook check produces an event — passes and denials. Every `PreToolUse` invocation writes to SQLite. Full observability over performance.

No deduplication. Each invocation produces one event. If an agent hits `write-checked (denied)` 50 times, 50 events are stored. The analytics layer aggregates.

### D3: Viewer ships in this PRD

The session viewer is built as part of this PRD, not deferred. It is the primary tool for a human to understand what happened in a session.

### D4: Event schema versioning — upcasting

Schema evolution handled by upcasting in the fold function (defaults for missing fields). No version fields on events. With <1000 events per session and a single codebase, this is sufficient.

### D5: Fold from scratch every time

No snapshot cache. Fold all events on every load. At <1ms for 500 events, this is not a performance concern. Revisit if sessions exceed 10K events.

### D6: onEntry effects as fat transition events

The `transitioned` event carries all onEntry-derived fields (`preBlockedState`, `iteration`, `developingHeadCommit`, etc.). The fold function applies them directly. Fewer events, simpler fold. See section 3.1.

### D7: Viewer uses static HTML + vanilla JS

Single HTML file with embedded CSS/JS. No build step, no framework. JSON API over SQLite. Zero dependencies, ships as a static asset inside the plugin.

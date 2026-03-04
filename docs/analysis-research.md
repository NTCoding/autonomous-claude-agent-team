# Post-Session Workflow Analysis: Research Document

## Scenario

A workflow designer reflects on a completed autonomous agent session to optimize their process design. This happens routinely after every session. The event log is telemetry on their own system — every hook denial, rework loop, and blocked episode is feedback on decisions they made about state definitions, guardrails, transition guards, and task decomposition.

## User Profile

The user built and maintains the autonomous agent workflow. They defined the state machine, wrote the state procedures, configured the guardrails. They are not assessing output quality or deciding whether to trust the PR. The PR might already be merged. They are looking backwards to improve the process itself.

## Usage Modes

**Routine scan (most sessions):** Session went fine, confirm nothing unusual, move on. Under a minute.

**Deep investigation:** Something felt off, or the workflow was recently changed, or a particular task type caused friction. The user goes through the event log with a fine tooth comb, potentially spending significant time digging into specifics.

The tool must serve both modes without forcing either.

## The Analysis Flow

1. **Session finishes** — event log is persisted in SQLite
2. **User opens the viewer** — scans or investigates visually
3. **Claude's pre-computed insights are embedded** — observations, anomalies, improvement suggestions already written into the report at generation time
4. **User spots something worth discussing** — wants to explore further
5. **Hands off to Claude Code** — copies a contextual prompt from the viewer, continues analysis interactively

The viewer is a **pre-analyzed report with a conversation on-ramp**. Claude does analysis at generation time (reads the event log, computes analytics, writes insights). The viewer shows both the raw data and Claude's interpretation. The conversation starters are continuations of analytical threads Claude already started — not generic prompts.

## Event Data Inventory

### 25 Event Types Across 6 Categories

**State transitions (1 type)**
- `transitioned` — from, to, iteration, developingHeadCommit, preBlockedState

**Workflow milestones (6 types)**
- `session-started` — sessionId, transcriptPath
- `issue-recorded` — issueNumber
- `branch-recorded` — branch
- `plan-approval-recorded`
- `pr-created` — prNumber
- `pr-recorded` — prNumber

**Iteration lifecycle (4 types)**
- `iteration-task-assigned` — task (free text description)
- `developer-done-signaled`
- `iteration-ticked` — issueNumber
- `issue-checklist-appended` — issueNumber

**Review outcomes (4 types)**
- `review-approved`
- `review-rejected`
- `coderabbit-addressed`
- `coderabbit-ignored`

**Permission enforcement (4 types)**
- `write-checked` — tool, filePath, allowed, reason
- `bash-checked` — tool, command, allowed, reason
- `plugin-read-checked` — tool, path, allowed, reason
- `idle-checked` — agentName, allowed, reason

**Agent lifecycle & context (5 types)**
- `agent-registered` — agentType, agentId
- `agent-shut-down` — agentName
- `identity-verified` — status, transcriptPath
- `context-requested` — agentName
- `journal-entry` — agentName, content (free text)

**Quality gates (1 type)**
- `lint-ran` — files, passed, lintedFiles

All events carry an `at` timestamp (ISO string).

### 11 Workflow States

| State | Emoji | Role |
|-------|-------|------|
| SPAWN | 🟣 | Initialize team, record GitHub issue |
| PLANNING | ⚪ | Structure iterations, get user plan approval |
| RESPAWN | 🔄 | Shut down old agents, prepare fresh agents for next iteration |
| DEVELOPING | 🔨 | Developer implements current task |
| REVIEWING | 📋 | Reviewer inspects uncommitted changes |
| COMMITTING | 💾 | Commit, push, lint, tick iteration |
| CR_REVIEW | 🐰 | CodeRabbit automated review |
| PR_CREATION | 🚀 | Create PR, wait for CI |
| FEEDBACK | 💬 | Triage human PR review comments |
| BLOCKED | ⚠️ | Paused, needs human intervention |
| COMPLETE | ✅ | Terminal state |

### State Transition Graph

```
SPAWN → PLANNING → RESPAWN → DEVELOPING → REVIEWING → COMMITTING
                      ↑          ↑              |           |
                      |          |     (rejected)|           |
                      |          +---------<-----+           |
                      |                                      |
                      +----------------<---------------------+
                      |                    (more iterations)
                      |
                 CR_REVIEW → PR_CREATION → FEEDBACK → COMPLETE
                                              |
                                              +--→ RESPAWN (more changes needed)

Any state → BLOCKED → back to pre-blocked state
```

### Accumulated State (from event folding)

```
WorkflowState {
  state: string
  iteration: number
  iterations: IterationState[]
  githubIssue?: number
  featureBranch?: string
  prNumber?: number
  userApprovedPlan: boolean
  activeAgents: string[]
  transcriptPath?: string
  preBlockedState?: string
}

IterationState {
  task: string
  developerDone: boolean
  developingHeadCommit?: string
  reviewApproved: boolean
  reviewRejected: boolean
  coderabbitFeedbackAddressed: boolean
  coderabbitFeedbackIgnored: boolean
  lintedFiles: string[]
  lintRanIteration: boolean
}
```

## Intelligence the Event Data Can Produce

### What Each Event Category Tells the Workflow Designer

| Process Design Decision | Event Signal That Gives Feedback |
|---|---|
| How I decomposed iterations | Iteration count, time per iteration, rework per iteration |
| How I defined guardrails | Hook denial frequency, which rules get violated, denial clustering by state |
| How I structured the review step | Rejection rate, rejection→approval cycle count, review duration |
| How I set up agent spawning | Time in RESPAWN, agent lifecycle events, context-requested frequency |
| Whether planning was sufficient | Rework in early iterations, blocked episodes, task reassignment patterns |
| Whether the state machine flow works | Actual path taken vs happy path, unexpected transitions, time distribution across states |

### Computable Metrics (Single Session)

**Rework analysis**
- Review rejection count (total and per iteration)
- First-pass approval rate: what % of iterations pass review on first attempt
- Rework cycles: count of REVIEWING → DEVELOPING loops per iteration
- Rework cost: time in DEVELOPING after rejections vs time in first-pass DEVELOPING

**Bottleneck detection**
- Time distribution across states (which state consumes most wall-clock time)
- RESPAWN overhead: time spent spawning fresh agents between iterations
- Blocked duration and frequency
- Review latency: time in REVIEWING before verdict

**Agent compliance**
- Hook denial count by type (write, bash, pluginRead, idle)
- Denial clustering by state: do denials concentrate in specific states?
- Repeat denials: same tool+path denied multiple times (agent stuck in a loop)
- Denial-to-event ratio: fraction of agent actions that get blocked

**Iteration velocity**
- Time per iteration: from `iteration-task-assigned` to next assignment or session end
- Events per iteration: complexity/effort proxy
- Iteration time breakdown: proportion of each iteration spent in dev vs review vs commit
- Velocity trend: are later iterations faster or slower?

**Session health**
- Total duration
- Final state (COMPLETE vs stuck somewhere)
- Blocked episode count and total blocked time
- Overall denial rate

**Path analysis**
- Actual state sequence vs expected happy path
- State visit frequency: which states get revisited (rework indicator)
- Transition count: total state changes as a session complexity measure

### Computable Insights (Claude-Generated at Report Time)

These are qualitative observations Claude can produce by analyzing the computed metrics:

- "3 review rejections in iteration 2 — task may have been underspecified"
- "Hook denials clustered in DEVELOPING state — agents may be confused about write permissions in this state"
- "45% of session time spent in REVIEWING — review step may be too strict or developer output quality is low"
- "Session blocked twice during COMMITTING — lint rules may need adjustment"
- "Iteration 3 took 3x longer than iterations 1 and 2 — task complexity was uneven"
- "Zero hook denials — guardrails are well-calibrated for this type of task"
- "First-pass approval rate 100% — review structure is working well"

### What the Event Data Cannot Tell

- **Review content**: We know it was rejected, but not what the feedback said. Journal entries are the only qualitative source.
- **Diff size**: No event captures how much code changed. Affects interpretation of everything else.
- **Test results**: Lint ran, but test pass/fail is not captured as an event.
- **CodeRabbit finding count/severity**: We know findings were addressed or ignored, but not how many or what kind.
- **Agent reasoning**: Journal entries contain free text but are unstructured. No systematic capture of why an agent made a decision.
- **User wait time**: BLOCKED captures when the workflow needs human input, but not how long the human took to respond (vs how long the system waited).

## Existing Analysis Infrastructure

### Current Functions

| Function | Input | Output |
|---|---|---|
| `generateViewerHtml(store)` | SqliteEventStore | Self-contained HTML string |
| `buildSessionViewData(id, events)` | sessionId + BaseEvent[] | SessionViewData (timeline, iterations, recent events) |
| `buildSessionListItem(id, events)` | sessionId + BaseEvent[] | SessionListItem (summary for list view) |
| `computeSessionSummary(id, events)` | sessionId + BaseEvent[] | SessionSummary (metrics, state durations, denials) |
| `computeCrossSessionSummary(store)` | SqliteEventStore | Cross-session aggregates |
| `computeEventContext(id, events)` | sessionId + BaseEvent[] | Current state, active agents, last 15 events |

### Current CLI Commands

| Command | What It Does |
|---|---|
| `workflow view` | Generates HTML viewer, writes to /tmp, opens in browser |
| `workflow analyze <sessionId>` | Prints text summary for one session |
| `workflow analyze --all` | Prints cross-session summary |
| `workflow event-context <sessionId>` | Prints current state + recent events |

### Current Viewer Capabilities

- Multi-session list with clickable rows
- Session detail view with state timeline (proportional colored bar)
- Iteration groups with event listings
- Recent events feed
- Self-contained single HTML file, no dependencies

### What's Missing for the Post-Session Reflection Scenario

1. **Claude-generated insights** — no analytical narrative, just raw data display
2. **Single-session focus** — current viewer is multi-session list → detail, not optimized for reflecting on one session
3. **Conversation on-ramp** — no way to continue analysis with Claude Code from the viewer
4. **Rework analysis** — rejection patterns not surfaced as a first-class metric
5. **Anomaly highlighting** — nothing calls attention to what's unusual about this session
6. **Agent compliance view** — hook denials exist in the data but aren't prominently surfaced
7. **Iteration-level metrics** — iterations shown as event groups but no per-iteration analysis (velocity, rework cost)

## Design Considerations

### Information Hierarchy

1. **What stands out?** — Claude's insights, anomalies, friction points (the headline)
2. **Process shape** — state timeline, iterations, time distribution (the context)
3. **Drill into specifics** — event log, journal entries, per-iteration details (the depth)

### The Conversation Handoff

The viewer doesn't need to answer every question. It needs to:
- Show the shape of the session (visual, fast)
- Surface what's notable (Claude's pre-computed insights)
- Make it obvious how to go deeper with Claude Code (contextual prompts)

Prompts should be contextual to specific insights, not generic. "Let's discuss why iteration 2 had 3 review rejections" — not "Analyze my session."

### Two Usage Modes, One Tool

- **Quick scan**: Insights section + timeline answers "anything notable?" in seconds
- **Deep investigation**: Expandable iterations, full event log, filters, journal entries available below

The surface should be scannable. The depth should be available without switching tools or views.

# PRD: Session Analysis Report UI

**Status:** Planning

## Context

After every autonomous agent session, the workflow designer reflects on what happened. The event log is telemetry on their own system — every hook denial, rework loop, and blocked episode is feedback on decisions they made about state definitions, guardrails, transition guards, and task decomposition.

The current viewer (`workflow view`) shows a multi-session list with basic detail views. It displays raw data with no interpretation. The designer must mentally compute which patterns matter, what's unusual, and what to change. There's no analytical narrative, no structured event display, no way to continue analysis with Claude Code.

Two HTML mockups define the target UI:
- **Primary**: `docs/mockup-a-insights-first.html` — tab-based navigation, insights-first overview
- **Alternative**: `docs/mockup-c-sidebar-timeline.html` — sidebar with vertical timeline

The final implementation MUST look identical to mockup-a. Every piece of information, every feature, every interaction in that mockup MUST exist in the final version.

### References

- `docs/analysis-research.md` — User profile, event data inventory, computable metrics, design considerations
- `docs/mockup-a-insights-first.html` — Primary mockup (implementation target)
- `docs/mockup-c-sidebar-timeline.html` — Alternative mockup (reference only)

---

## 1. Problems

### P1: No analytical narrative

The current viewer shows raw numbers (event counts, state durations) without interpretation. The designer must compute what's unusual. A session with 5 hook denials and 2 review rejections looks the same as a clean session — there's nothing calling attention to friction points.

```
Current viewer output for a problematic session:

  Session: abc-1234
  Duration: 47m 23s
  Events: 56
  Iterations: 3
  Hook Denials: write=3 bash=2    ← notable, but not highlighted
  Review Rejected: 2               ← notable, but not highlighted
```

### P2: No structured event display

Events render as flat `timestamp + type` strings. A `write-checked` event that carries `tool`, `filePath`, `allowed`, and `reason` fields shows as just "write-checked". The Zod schemas define rich structured data per event type — none of it is visible.

```
Current:  14:32:10 write-checked

Needed:   14:32:10 DEV write-checked DENIED
          tool=Write filePath=src/config/retry-config.ts reason="outside developer scope"
```

### P3: No iteration-level analysis

Iterations are grouped as event lists but have no per-iteration metrics. The designer can't see that iteration 2 consumed 47% of session time, had 2 rejections, and 5 hook denials — without manually counting events and computing durations.

### P4: No conversation on-ramp

The viewer is a dead end. When the designer spots something worth investigating, they must manually construct a Claude Code prompt, remember the session ID, and figure out what commands to run. There's no way to continue analysis from a specific insight.

### P5: No suggestions for workflow improvement

The viewer identifies what happened (descriptive) but not what to change (prescriptive). When guardrails cause rework, the viewer should suggest specific file changes, config adjustments, or planning process improvements — not just report the friction.

---

## 2. Design Principles

### DP1: Insights first, data second

The overview tab leads with Claude's pre-computed insights and suggestions, not raw metrics. Metrics and timeline are "Session Shape" — supporting context below the analytical narrative.

### DP2: Heuristic rules, not API calls

Insights and suggestions are generated at HTML generation time by applying deterministic heuristic rules to computed metrics. No Claude API calls at generation time. The rules are code — testable, predictable, version-controlled.

### DP3: Self-contained HTML

The report is a single HTML file with all CSS, JS, and data embedded. No external dependencies, no CDN, no build step. Opens in any browser. Same pattern as the current `generateViewerHtml()`.

### DP4: Conversation on-ramp, not replacement

The report doesn't answer every question. It shows the session shape, surfaces what's notable, and makes it obvious how to go deeper with Claude Code. Every insight and suggestion has a "Continue with Claude" button that copies a contextual CLI prompt.

### DP5: Two usage modes, one tool

- **Routine scan** (<1 minute): Insights section + timeline answers "anything notable?" in seconds
- **Deep investigation**: Expandable iterations, full event log with faceted search, journal entries available via tabs

The surface is scannable. The depth is available without switching tools.

### DP6: Real data, not approximations

Every number shown in the report is computed from actual event data. Every formula is specified in this PRD. No placeholder metrics, no estimated values.

---

## 3. What We're Building

### 3.1 Enhanced Session Metrics

Extend the existing `SessionSummary` with rework analysis, iteration velocity, and first-pass approval rate.

```typescript
// New file: src/workflow-analysis/session-report.ts

type IterationMetrics = {
  iterationIndex: number
  task: string
  durationMs: number
  devTimeMs: number
  reviewTimeMs: number
  commitTimeMs: number
  respawnTimeMs: number
  rejectionCount: number
  hookDenials: { write: number; bash: number; pluginRead: number; idle: number }
  firstPassApproval: boolean
  reworkCycles: number               // count of REVIEWING → DEVELOPING loops
  proportionOfSession: number        // this iteration's duration / total duration
}

type ReworkAnalysis = {
  totalRejections: number
  firstPassApprovalRate: number      // iterations approved on first review / total iterations
  reworkTimeMs: number               // time in DEVELOPING after a rejection (not first-pass dev)
  reworkProportion: number           // reworkTimeMs / total session duration
  worstIteration: number | undefined // iteration index with most rejections
}

type EnhancedSessionSummary = SessionSummary & {
  iterationMetrics: readonly IterationMetrics[]
  reworkAnalysis: ReworkAnalysis
  totalDenials: number               // sum of all hook denial types
  velocityTrend: readonly number[]   // duration per iteration in ms, chronological order
  transcriptPath: string | undefined // from session-started event
  githubIssue: number | undefined    // from issue-recorded event
  featureBranch: string | undefined  // from branch-recorded event
  prNumber: number | undefined       // from pr-created or pr-recorded event
}
```

**Computation formulas:**

| Metric | Formula | Source Events |
|--------|---------|---------------|
| `iterationMetrics[i].durationMs` | Time from `iteration-task-assigned[i]` to `iteration-task-assigned[i+1]` (or session end) | `iteration-task-assigned` |
| `iterationMetrics[i].devTimeMs` | Sum of time in DEVELOPING state during this iteration | `transitioned` events where `to=DEVELOPING` and `to=REVIEWING` within iteration window |
| `iterationMetrics[i].reviewTimeMs` | Sum of time in REVIEWING state during this iteration | `transitioned` events where `to=REVIEWING` and `to=COMMITTING` or `to=DEVELOPING` within iteration |
| `iterationMetrics[i].rejectionCount` | Count of `review-rejected` events within iteration window | `review-rejected` |
| `iterationMetrics[i].hookDenials` | Count of `*-checked` events where `allowed=false` within iteration window | `write-checked`, `bash-checked`, `plugin-read-checked`, `idle-checked` |
| `iterationMetrics[i].firstPassApproval` | First review event in iteration is `review-approved` (not preceded by `review-rejected`) | `review-approved`, `review-rejected` |
| `iterationMetrics[i].reworkCycles` | Count of `transitioned` events where `from=REVIEWING to=DEVELOPING` within iteration | `transitioned` |
| `reworkAnalysis.firstPassApprovalRate` | `iterations.filter(i => i.firstPassApproval).length / iterations.length` | Derived from `iterationMetrics` |
| `reworkAnalysis.reworkTimeMs` | Sum of DEVELOPING time after the first REVIEWING→DEVELOPING transition per iteration | `transitioned` |
| `totalDenials` | `hookDenials.write + hookDenials.bash + hookDenials.pluginRead + hookDenials.idle` | `SessionSummary.hookDenials` |
| `transcriptPath` | `session-started` event's `transcriptPath` field | `session-started` |
| `githubIssue` | `issue-recorded` event's `issueNumber` field | `issue-recorded` |
| `featureBranch` | `branch-recorded` event's `branch` field | `branch-recorded` |
| `prNumber` | `pr-created` or `pr-recorded` event's `prNumber` field | `pr-created`, `pr-recorded` |

**Reuse:** `computeSessionSummary()` from `workflow-analytics.ts` provides the base `SessionSummary`. The enhanced computation wraps it and adds iteration-level analysis using `buildSessionViewData()` from `session-view.ts`.

### 3.2 Insight Engine

Insights are observations about what happened. Each insight has a severity, evidence text, and a contextual "Continue with Claude" prompt.

```typescript
// New file: src/workflow-analysis/insight-rules.ts

type InsightSeverity = 'warning' | 'info' | 'success'

type Insight = {
  severity: InsightSeverity
  title: string                     // one-line summary shown in collapsed state
  evidence: string                  // detailed explanation shown when expanded
  prompt: string | undefined        // "Continue with Claude" CLI prompt (undefined = no prompt)
}

type InsightRule = {
  name: string
  evaluate: (summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]) => Insight | undefined
}
```

**Heuristic rules (initial set):**

#### Rule: `rework-dominated-iteration`

- **Trigger:** Any iteration where `rejectionCount >= 2`
- **Severity:** `warning`
- **Title template:** `⚠ {rejectionCount} review rejections in iteration {i} — rework dominated the session`
- **Evidence template:** `Task "{task}" required {rejectionCount + 1} review cycles before approval. Iteration {i} consumed {proportionOfSession}% of session time ({durationFormatted}) despite being 1 of {totalIterations} iterations.` If journal entries exist for this iteration, append: `Root cause visible in transcript: {relevant journal summary}.`
- **Prompt template:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}

  Read the transcript at {transcriptPath} focusing on iteration {i}. The task "{task}" had {rejectionCount} review rejections. Cross-reference the journal entries with the hook denial events. Is this a guardrail scope problem, a task decomposition problem, or both?
  ```

#### Rule: `hook-denial-cluster`

- **Trigger:** `totalDenials >= 3` AND denials cluster in a single state (>60% in one state)
- **Severity:** `warning`
- **Title template:** `⚠ {totalDenials} hook denials clustered in {dominantState} — guardrail/task mismatch`
- **Evidence template:** `{writeCount}× write-checked denied{specific paths}, {bashCount}× bash-checked denied{specific commands}. All during {state} state.` If journal entries mention workarounds, append the relevant entry.
- **Prompt template:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}

  {totalDenials} hook denials in {state}: {breakdown}. Should the write scope be expanded? What are the security trade-offs?
  ```

#### Rule: `iteration-velocity-anomaly`

- **Trigger:** Any iteration duration > 2× the median iteration duration
- **Severity:** `info`
- **Title template:** `ℹ Iteration velocity: {velocities} — iteration {i} was {ratio}× slower`
- **Evidence template:** `{fastIterations}: ~{medianFormatted} with first-pass approval. Iteration {i}: {slowFormatted} — {analysis of where time went}.`
- **Prompt template:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}
  autonomous-claude-agent-team:analyze --all

  Compare iteration velocity for session {sessionId} ({velocities}) against recent sessions. Is the pattern recurring?
  ```

#### Rule: `session-completed-clean`

- **Trigger:** Session reached COMPLETE state
- **Severity:** `success`
- **Title template:** `✓ Session completed — {iterationCount} iterations, PR #{prNumber} created`
- **Evidence template:** `First-pass approval rate: {rate}% ({approved}/{total}). {denialSummary}. {blockedSummary}.`
- **Prompt:** `undefined` (no prompt needed for clean completion)

#### Rule: `session-blocked`

- **Trigger:** `blockedEpisodes >= 1`
- **Severity:** `warning`
- **Title template:** `⚠ Session blocked {count} time(s) — required human intervention`
- **Evidence template:** `Blocked in {states} state(s). {blockedDurationEstimate}.`
- **Prompt template:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}

  Session was blocked {count} time(s). Read the events around each BLOCKED transition to understand what triggered the block. Can any of these be prevented by adjusting guardrails or planning?
  ```

#### Rule: `zero-denials`

- **Trigger:** `totalDenials === 0` AND `iterationCount >= 2`
- **Severity:** `success`
- **Title template:** `✓ Zero hook denials — guardrails well-calibrated for this task`
- **Evidence template:** `{iterationCount} iterations completed without a single guardrail violation. Agents stayed within permitted boundaries throughout.`
- **Prompt:** `undefined`

#### Rule: `high-respawn-overhead`

- **Trigger:** Time in RESPAWN state > 15% of total session duration
- **Severity:** `info`
- **Title template:** `ℹ {respawnPercent}% of session time in RESPAWN — agent spawn overhead is significant`
- **Evidence template:** `{respawnFormatted} spent spawning agents across {respawnCount} respawn cycles. Average respawn: {avgFormatted}.`
- **Prompt template:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}

  {respawnPercent}% of session time was spent in RESPAWN state. Is this typical? Are there ways to reduce agent spawn overhead?
  ```

**Rule ordering:** Rules are evaluated in priority order. All matching rules fire (not just the first). Output is sorted: warnings first, then info, then success.

### 3.3 Suggestion Engine

Suggestions are prescriptive — they recommend specific workflow changes. Each suggestion points at a specific file, config, or process to modify.

```typescript
type Suggestion = {
  title: string                     // one-line action shown collapsed
  rationale: string                 // why this change would help
  change: string                    // specific change description with file paths
  tradeoff: string                  // what you give up
  prompt: string                    // "Continue with Claude" CLI prompt
}

type SuggestionRule = {
  name: string
  evaluate: (summary: EnhancedSessionSummary, events: readonly WorkflowEvent[]) => Suggestion | undefined
}
```

**Heuristic rules (initial set):**

#### Rule: `expand-write-scope`

- **Trigger:** `hookDenials.write >= 2` AND denied paths share a common directory prefix
- **Title template:** `💡 Add {commonPrefix} to developer write scope`
- **Rationale:** Describe the denied write attempts, what the developer was trying to do (from journal if available), and the downstream effect (review rejections if correlated).
- **Change:** `In workflow-definition/hooks/write-guard.ts, add {commonPrefix} to the developer's allowed write paths during DEVELOPING state.`
- **Tradeoff:** `Wider write scope means the developer could modify {prefix} files unrelated to their task. Mitigated by the reviewer catching unrelated changes.`
- **Prompt:**
  ```
  autonomous-claude-agent-team:analyze {sessionId}

  Read workflow-definition/hooks/write-guard.ts. The developer was denied writes to {paths}. Add {commonPrefix} to the developer's allowed write paths. Show me the specific code change and explain the security implications.
  ```

#### Rule: `detect-guardrail-conflicts-in-planning`

- **Trigger:** Hook denials in DEVELOPING that correlate with review rejections (denial event timestamp < rejection timestamp in same iteration)
- **Title template:** `💡 Detect guardrail conflicts during planning`
- **Rationale:** The task required writes/commands that guardrails blocked. Planning didn't surface this conflict.
- **Change:** `Add a checklist item to states/planning.md: "For each iteration task, verify that required file paths fall within the developer write scope."`
- **Tradeoff:** `Makes planning slightly slower. Prevents rework loops caused by guardrail/task mismatches.`

#### Rule: `improve-issue-description`

- **Trigger:** Iteration with both hook denials AND review rejections, AND the denied paths suggest a category of files not mentioned in the task description
- **Title template:** `💡 Issue #{issueNumber} didn't specify {fileCategory} requirements`
- **Rationale:** The task description didn't mention that implementation required writing to {paths}, which are outside the standard developer scope.
- **Change:** `Update the issue template or planning prompt to include: "List file paths or directories each iteration will need to modify."`
- **Tradeoff:** `Adds overhead to issue creation. The lead agent already reads the codebase during planning — this makes the output more explicit.`

### 3.4 Event Categorization and Structured Fields

Every event type maps to a category and renders its Zod schema fields as key=value tags.

**Event category mapping:**

| Event Type | Category | Badge | Badge Color |
|------------|----------|-------|-------------|
| `transitioned` | `transition` | State name (abbrev) | State color |
| `session-started` | `milestone` | State badge | State color |
| `issue-recorded` | `milestone` | State badge | State color |
| `branch-recorded` | `milestone` | State badge | State color |
| `plan-approval-recorded` | `milestone` | State badge | State color |
| `pr-created` | `milestone` | State badge | State color |
| `pr-recorded` | `milestone` | State badge | State color |
| `iteration-task-assigned` | `devcycle` | State badge | State color |
| `developer-done-signaled` | `devcycle` | State badge | State color |
| `iteration-ticked` | `devcycle` | State badge | State color |
| `issue-checklist-appended` | `devcycle` | State badge | State color |
| `review-approved` | `review` | State badge | State color |
| `review-rejected` | `review` | State badge | State color |
| `coderabbit-addressed` | `review` | State badge | State color |
| `coderabbit-ignored` | `review` | State badge | State color |
| `write-checked` | `permission` | State badge | State color |
| `bash-checked` | `permission` | State badge | State color |
| `plugin-read-checked` | `permission` | State badge | State color |
| `idle-checked` | `permission` | State badge | State color |
| `agent-registered` | `agent` | State badge | State color |
| `agent-shut-down` | `agent` | State badge | State color |
| `identity-verified` | `agent` | State badge | State color |
| `context-requested` | `agent` | State badge | State color |
| `journal-entry` | `journal` | State badge | State color |
| `lint-ran` | `quality` | State badge | State color |

**Structured field rendering per event type:**

Each event type renders specific fields from its Zod schema as `key=value` tags. These are the fields defined in `src/workflow-definition/domain/workflow-events.ts`:

| Event Type | Rendered Fields |
|------------|----------------|
| `transitioned` | `from`, `to`, `iteration` (if present), `preBlockedState` (if present) |
| `session-started` | `sessionId`, `transcriptPath` (if present) |
| `issue-recorded` | `issueNumber` |
| `branch-recorded` | `branch` |
| `iteration-task-assigned` | `task` |
| `pr-created` | `prNumber` |
| `pr-recorded` | `prNumber` |
| `issue-checklist-appended` | `issueNumber` |
| `iteration-ticked` | `issueNumber` |
| `write-checked` | `tool`, `filePath`, `allowed` (as DENIED/allowed outcome badge), `reason` |
| `bash-checked` | `tool`, `command`, `allowed` (as DENIED/allowed outcome badge), `reason` |
| `plugin-read-checked` | `tool`, `path`, `allowed` (as outcome badge), `reason` |
| `idle-checked` | `agentName`, `allowed` (as outcome badge), `reason` |
| `agent-registered` | `agentType`, `agentId` |
| `agent-shut-down` | `agentName` |
| `identity-verified` | `status`, `transcriptPath` |
| `context-requested` | `agentName` |
| `journal-entry` | `agentName`, `content` (rendered as italicized block below the event row) |
| `lint-ran` | `files`, `passed` |
| `review-approved` | Outcome badge: APPROVED (green) |
| `review-rejected` | Outcome badge: REJECTED (red) |
| `plan-approval-recorded` | (no additional fields) |
| `developer-done-signaled` | (no additional fields) |
| `coderabbit-addressed` | (no additional fields) |
| `coderabbit-ignored` | (no additional fields) |

**Outcome badges:** Events with `allowed` field show DENIED (red) or allowed. Review events show APPROVED (green) or REJECTED (red).

**State association:** Each event is associated with the workflow state it occurred in, determined by the most recent `transitioned` event's `to` field at the time of the event. This state determines the badge color.

**State badge abbreviations:**

| State | Abbreviation | CSS Color |
|-------|-------------|-----------|
| SPAWN | SPAWN | `#9b59b6` |
| PLANNING | PLAN | `#95a5a6` |
| RESPAWN | RESP | `#1abc9c` |
| DEVELOPING | DEV | `#3498db` |
| REVIEWING | REV | `#e67e22` |
| COMMITTING | COM | `#2ecc71` |
| CR_REVIEW | CR | `#e91e63` |
| PR_CREATION | PR | `#f39c12` |
| FEEDBACK | FB | `#f39c12` |
| BLOCKED | BLOCK | `#e74c3c` |
| COMPLETE | DONE | `#27ae60` |

### 3.5 HTML Report Generation

A new function generates the single-session analysis report as self-contained HTML.

```typescript
// New file: src/workflow-analysis/report-html.ts

type ReportData = {
  summary: EnhancedSessionSummary
  viewData: SessionViewData
  insights: readonly Insight[]
  suggestions: readonly Suggestion[]
  events: readonly WorkflowEvent[]        // all events with category + state annotation
  journalEntries: readonly JournalEntry[]  // extracted and enriched journal entries
}

type JournalEntry = {
  at: string
  agentName: string
  content: string
  iterationIndex: number
  state: string
  context: string        // e.g., "after 1st rejection", "preceded by 3 hook denials"
}

function generateReportHtml(store: SqliteEventStore, sessionId: string): string
```

**The generated HTML MUST match `docs/mockup-a-insights-first.html` exactly in:**

#### Header

Single row with labeled values:
- Repository name (from git remote or hardcoded)
- Final state badge (✅ COMPLETE, ⚠️ BLOCKED, etc.)
- Session ID
- Started time (formatted: "Mar 3, 2:14 PM")
- Ended time (formatted: "3:01 PM")
- Duration in parentheses (formatted: "47m 23s")
- Issue number (linked to GitHub)
- Branch name
- PR number (linked to GitHub)
- Transcript path (linked)

Source: `session-started` event for sessionId + transcriptPath, `issue-recorded` for issue, `branch-recorded` for branch, `pr-created`/`pr-recorded` for PR, timestamps from first/last events.

#### Tab bar

5 tabs in this order:
1. **Overview** — default active tab
2. **Iterations** — with count badge (e.g., "3")
3. **Event Log** — with count badge (e.g., "56"), alert style if denials exist
4. **Journal** — with count badge (e.g., "3")
5. **Continue in Claude Code**

#### Overview tab

Three sections in order:

**1. Insights** — Section label "Insights". Collapsible cards, collapsed by default. Each card has:
- Left border color by severity: warning=`#e67e22`, info=`#3498db`, success=`#27ae60`
- Title with severity emoji (⚠, ℹ, ✓)
- Expandable body with evidence text + "Continue with Claude" button (if prompt exists)
- "Continue with Claude" button is blue, positioned top-right of the prompt code block
- Prompt text is monospace, pre-wrapped, in a light gray box

**2. Suggestions** — Section label "Suggestions". Collapsible cards, collapsed by default. Each card has:
- Left border color: `#8e44ad` (purple)
- Title with 💡 emoji
- Expandable body with: rationale, change (in purple-tinted box with bold "Change:" prefix), tradeoff (smaller gray text with ⚖ prefix), "Continue with Claude" button

**3. Session Shape** — Section label "Session Shape". Contains:
- **Metrics row:** 6 metric cards in a flex row. Each card has a large value and small label. Cards with concerning values get warning styling (orange border + text). Metrics shown:
  - Duration (formatted, e.g., "47m")
  - Iterations (count)
  - Review Rejections (count, warn if > 0)
  - Hook Denials (count, warn if > 0)
  - First-Pass Approval (percentage, warn if < 100%)
  - Blocked Episodes (count, warn if > 0)
- **Timeline bar:** Proportional colored bar showing state sequence. Each segment:
  - Width proportional to duration
  - Color by state (see 3.4 color table)
  - Hover tooltip: "STATE duration"
  - Text label for wider segments (state abbreviation, ✓/✗ for review outcomes)
- **Legend:** Horizontal flex row of color swatches with state names

**Metric computation:**

| Displayed Metric | Computation |
|-----------------|-------------|
| Duration | `formatDuration(totalDurationMs)` — already in `workflow-analytics.ts` |
| Iterations | `iterationCount` from `SessionSummary` |
| Review Rejections | `reviewOutcomes.rejected` from `SessionSummary` |
| Hook Denials | `totalDenials` from `EnhancedSessionSummary` |
| First-Pass Approval | `reworkAnalysis.firstPassApprovalRate * 100` formatted as percentage |
| Blocked Episodes | `blockedEpisodes` from `SessionSummary` |

#### Iterations tab

One collapsible card per iteration. Cards are collapsed by default.

**Card header:**
- Title: "Iteration {i}: {task}"
- Badges: first-pass approval (green "✓ first-pass" or red "{n} rejections"), denial count if > 0 (orange), duration
- Flagged iterations (rejections > 0 OR denials > 0) get orange left border

**Card body (expanded):**
- **Iteration metrics row:** Dev time, Review time, Rejections, Denials, proportion of session (warn styled if > 33%)
- **Event list:** Every event in the iteration, rendered with structured fields per section 3.4

**Iteration metrics computation:**

| Displayed | Computation |
|-----------|-------------|
| Dev time | `iterationMetrics[i].devTimeMs` formatted |
| Review time | `iterationMetrics[i].reviewTimeMs` formatted |
| Rejections | `iterationMetrics[i].rejectionCount` |
| Denials | Sum of `iterationMetrics[i].hookDenials` values |
| % of session | `iterationMetrics[i].proportionOfSession * 100` |

#### Event Log tab

Datadog-style faceted log explorer. Full viewport height minus header/tabs.

**Layout:** CSS Grid — `200px 1fr`, rows: `auto 1fr`

**Search bar** (spans full width):
- Text input with placeholder "Search events… (text, field values, agent names)"
- Result count display (e.g., "56 events")
- Searches against all visible text in each event row

**Facet sidebar** (200px left column):
- 4 facet groups, each with a title and list of facet values:

  **Category facet:**
  - Values: State Transition, Permission, Review, Dev Cycle, Agent, Milestone, Journal, Quality
  - Counts computed from event category mapping

  **State facet:**
  - Values: Each state that appears in the session
  - Counts: Number of events that occurred during each state

  **Iteration facet:**
  - Values: Setup (pre-iteration events), Iteration 1, Iteration 2, ..., Finalize (post-iteration events)
  - Counts: Events per iteration group

  **Outcome facet:**
  - Values: Denied, Rejected, Approved
  - Counts: Events with those outcomes

- Each facet item shows: label, proportional bar, count
- Clicking toggles the facet filter (multiple selection within same group)
- Active facets highlighted in blue

**Event entries** (right column, scrollable):
- Each event rendered with: timestamp (monospace), state badge (colored), event name (bold), outcome badge (if applicable), structured field tags
- Permission denied events get light red background
- Journal events get light blue background
- Hidden events (`display: none`) when filtered out

**Filtering logic:**
- Facet dimensions are AND'd (selecting DEVELOPING state AND Permission category shows only permission events during DEVELOPING)
- Multiple values within a dimension are OR'd (selecting Iteration 1 AND Iteration 2 shows events from both)
- Text search AND's with facet filters

**Data attributes on event elements:**

Each `<div class="le">` carries:
- `data-cat` — event category (lowercase: transition, permission, review, devcycle, agent, milestone, journal, quality)
- `data-state` — workflow state at time of event
- `data-iter` — iteration number (0 for setup, "fin" for finalize)
- `data-outcome` — "denied", "rejected", or "approved" (only if applicable)

#### Journal tab

Extracted journal entries with enriched context.

Each entry shows:
- Agent name (bold, colored by agent type: developer=blue, reviewer=orange)
- Timestamp
- Context: "Iteration {i} · {STATE}" + contextual note (e.g., "preceded by 3 hook denials", "after 1st rejection")
- Content text (larger font, full width)

Below journal entries:
- "Full session transcript" card with description and linked path

**Context enrichment logic:**
- If journal entry is preceded (within 5 minutes) by hook denial events: "preceded by {n} hook denials"
- If journal entry follows a `review-rejected` event in the same iteration: "after {ordinal} rejection"
- Otherwise: just the iteration and state

#### Continue in Claude Code tab

Introductory text explaining the prompts.

Prompt blocks, each containing:
- Question text (bold, describes what the prompt investigates)
- Code block with CLI commands and analytical question
- "Continue with Claude" button (blue, top-right of code block)

**All CLI commands use the full plugin prefix:** `autonomous-claude-agent-team:analyze {sessionId}` — NOT `workflow analyze`.

**Prompt generation:**
- The Continue tab shows 3 general prompts derived from the session's most notable patterns
- These are generated from the insight/suggestion engine — the top 3 insights/suggestions that have prompts
- Each prompt starts with the appropriate CLI command(s), then asks a specific analytical question referencing the transcript, journal entries, and specific events

### 3.6 Client-Side JavaScript

All interactivity is vanilla JS embedded in the HTML. No frameworks, no build step.

**Functions:**

| Function | Behavior |
|----------|----------|
| `switchTab(id)` | Show tab pane, update active tab styling |
| `toggleBody(head)` | Expand/collapse insight card body, toggle arrow ▶/▼ |
| `toggleSuggestion(head)` | Expand/collapse suggestion card body |
| `toggleIter(head)` | Expand/collapse iteration card body |
| `copyCmd(btn)` | Copy prompt text to clipboard, change button to "Copied!" for 1.2s |
| `toggleFacet(el, dimension, value)` | Toggle facet filter, call `applyLogFilters()` |
| `searchLog(query)` | Set search text, call `applyLogFilters()` |
| `applyLogFilters()` | Apply facet + text filters to log entries, update result count |

**Filtering implementation:**
```javascript
// Facet state: { dimension: Set<value> }
// Dimensions AND together, values within a dimension OR together
// Text search ANDs with facet state
// Each .le element has data-cat, data-state, data-iter, data-outcome attributes
```

### 3.7 CLI Integration

New command: `view-report`

```
autonomous-claude-agent-team:view-report <sessionId>
```

Behavior:
1. Read events from `SqliteEventStore` for `sessionId`
2. Compute `EnhancedSessionSummary`
3. Run insight and suggestion rules
4. Generate HTML via `generateReportHtml()`
5. Write to `/tmp/session-report-{sessionId}.html`
6. Open in default browser
7. Print path to stdout

The existing `view` command is unchanged — it continues to show the multi-session list viewer.

**Composition root changes (`src/infra/composition-root.ts`):**
- Add `ReportDeps` type with event store access
- Wire `generateReportHtml` into the command handler

**Entrypoint changes (`src/autonomous-claude-agent-team-workflow.ts`):**
- Add `'view-report': handleViewReport` to `COMMAND_HANDLERS`
- `handleViewReport` validates sessionId argument, calls generation, opens browser

---

## 4. What We're NOT Building

- **Cross-session comparison in the report** — The report is single-session. Cross-session analysis stays in `workflow analyze --all`.
- **Real-time/live updates** — The report is a static snapshot generated after session completion.
- **Claude API calls at generation time** — All insights are heuristic. No LLM inference during HTML generation.
- **Editing workflow from the viewer** — The viewer suggests changes but doesn't apply them.
- **Custom themes or configuration** — One design, hardcoded. DP1 of the project: strict, not flexible.
- **Multi-session list in the report** — The report shows one session. The existing `view` command handles multi-session.
- **Sidebar-timeline layout (mockup C)** — Mockup A (tabs) is the implementation target. Mockup C is reference only.

---

## 5. Implementation Milestones

### M1: Enhanced Session Metrics

**Deliverable:** `computeEnhancedSessionSummary()` function returning `EnhancedSessionSummary`

**Files:**
- CREATE `src/workflow-analysis/session-report.ts` — types + computation
- CREATE `src/workflow-analysis/session-report.spec.ts` — 100% coverage

**Depends on:** Nothing (uses existing `SessionSummary` + `SessionViewData`)

**Acceptance:**
- All `IterationMetrics` fields computed from real event data
- `ReworkAnalysis` correctly identifies first-pass approval rate
- Velocity trend array matches iteration durations
- Metadata fields (transcript, issue, branch, PR) extracted from events

### M2: Insight and Suggestion Engine

**Deliverable:** `evaluateInsights()` and `evaluateSuggestions()` functions

**Files:**
- CREATE `src/workflow-analysis/insight-rules.ts` — rule definitions + evaluation
- CREATE `src/workflow-analysis/insight-rules.spec.ts` — 100% coverage

**Depends on:** M1 (uses `EnhancedSessionSummary`)

**Acceptance:**
- All 7 insight rules implemented and tested
- All 3 suggestion rules implemented and tested
- Rules produce correct output for edge cases (zero iterations, no denials, all-clean sessions)
- Prompt text uses `autonomous-claude-agent-team:analyze {sessionId}` prefix

### M3: Event Categorization and Structured Fields

**Deliverable:** Event annotation functions for category, state, iteration, fields

**Files:**
- CREATE `src/workflow-analysis/event-display.ts` — categorization + field extraction
- CREATE `src/workflow-analysis/event-display.spec.ts` — 100% coverage

**Depends on:** Nothing (uses `WorkflowEvent` types directly)

**Acceptance:**
- All 25 event types mapped to categories
- Structured fields extracted per event type per section 3.4 table
- State association computed from `transitioned` events
- Iteration association computed from `iteration-task-assigned` events

### M4: HTML Report Generation

**Deliverable:** `generateReportHtml()` producing self-contained HTML

**Files:**
- CREATE `src/workflow-analysis/report-html.ts` — HTML template + data embedding
- CREATE `src/workflow-analysis/report-html.spec.ts` — 100% coverage

**Depends on:** M1, M2, M3

**Acceptance:**
- Generated HTML visually identical to `docs/mockup-a-insights-first.html`
- All tabs functional: Overview, Iterations, Event Log, Journal, Continue
- Faceted log explorer with search + 4 facet groups
- Insight/suggestion cards with expand/collapse + "Continue with Claude"
- All data from `ReportData` embedded as JS variables
- Self-contained (no external dependencies)

### M5: CLI Integration

**Deliverable:** `view-report` command wired through entrypoint

**Files:**
- MODIFY `src/autonomous-claude-agent-team-workflow.ts` — add command handler
- MODIFY `src/infra/composition-root.ts` — add report deps
- UPDATE existing tests for new command routing

**Depends on:** M4

**Acceptance:**
- `autonomous-claude-agent-team:view-report <sessionId>` generates and opens report
- Error handling for missing sessionId, non-existent session
- Existing commands unaffected

---

## 6. Progress

### M1: Enhanced Session Metrics
- [ ] Define `IterationMetrics` type
- [ ] Define `ReworkAnalysis` type
- [ ] Define `EnhancedSessionSummary` type
- [ ] Implement `computeEnhancedSessionSummary()` using existing `computeSessionSummary()` + `buildSessionViewData()`
- [ ] Compute per-iteration dev/review/commit time from state transitions
- [ ] Compute per-iteration hook denials by filtering events within iteration windows
- [ ] Compute first-pass approval per iteration
- [ ] Compute rework cycles per iteration
- [ ] Extract metadata (transcript, issue, branch, PR) from events
- [ ] Tests: 100% coverage

### M2: Insight and Suggestion Engine
- [ ] Define `Insight`, `InsightRule`, `Suggestion`, `SuggestionRule` types
- [ ] Implement rule: `rework-dominated-iteration`
- [ ] Implement rule: `hook-denial-cluster`
- [ ] Implement rule: `iteration-velocity-anomaly`
- [ ] Implement rule: `session-completed-clean`
- [ ] Implement rule: `session-blocked`
- [ ] Implement rule: `zero-denials`
- [ ] Implement rule: `high-respawn-overhead`
- [ ] Implement rule: `expand-write-scope` (suggestion)
- [ ] Implement rule: `detect-guardrail-conflicts-in-planning` (suggestion)
- [ ] Implement rule: `improve-issue-description` (suggestion)
- [ ] Implement `evaluateInsights()` — runs all insight rules, sorts by severity
- [ ] Implement `evaluateSuggestions()` — runs all suggestion rules
- [ ] All prompts use `autonomous-claude-agent-team:analyze {sessionId}` prefix
- [ ] Tests: 100% coverage including edge cases (empty sessions, clean sessions)

### M3: Event Categorization and Structured Fields
- [ ] Define event-to-category mapping for all 25 event types
- [ ] Define field extraction per event type
- [ ] Implement state association (current state at time of each event)
- [ ] Implement iteration association (which iteration each event belongs to)
- [ ] Implement outcome extraction (denied/rejected/approved)
- [ ] Tests: 100% coverage

### M4: HTML Report Generation
- [ ] Define `ReportData` type
- [ ] Define `JournalEntry` enriched type
- [ ] Implement journal context enrichment logic
- [ ] Build HTML template: header with labeled values
- [ ] Build HTML template: tab bar with 5 tabs
- [ ] Build HTML template: Overview tab — insights section
- [ ] Build HTML template: Overview tab — suggestions section
- [ ] Build HTML template: Overview tab — metrics row (6 cards)
- [ ] Build HTML template: Overview tab — proportional timeline bar + legend
- [ ] Build HTML template: Iterations tab — collapsible cards with structured events
- [ ] Build HTML template: Event Log tab — Datadog-style faceted explorer
- [ ] Build HTML template: Journal tab — enriched entries + transcript link
- [ ] Build HTML template: Continue tab — contextual prompts
- [ ] Embed CSS matching mockup-a styles exactly
- [ ] Embed JS: tab switching, expand/collapse, clipboard, facet filtering, search
- [ ] Embed data as JS variables (like current `generateViewerHtml` pattern)
- [ ] Tests: 100% coverage

### M5: CLI Integration
- [ ] Add `'view-report': handleViewReport` to `COMMAND_HANDLERS`
- [ ] Implement `handleViewReport` — validate args, generate HTML, write to /tmp, open browser
- [ ] Add `ReportDeps` to composition root
- [ ] Update tests for new command routing
- [ ] Tests: 100% coverage

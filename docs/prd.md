# PRD: TypeScript Transformation

**Status:** Planning

## 1. Problem

The plugin's enforcement logic — state machine, hooks, lint runner — is implemented in ~800 lines of bash across 10 scripts. No test coverage exists. No coding standards are documented.

**Who has this problem:** Anyone maintaining or extending this plugin.

**Why it matters:**

1. **No tests.** Zero coverage. Changing behavior has no safety net. Regressions are discovered in production (during an agent workflow).

2. **No type safety.** Boolean checks via string comparison (`"$DEVELOPER_DONE" != "True"`), python3 embedded in bash for JSON parsing, no schema validation on the state file. A typo in a field name silently fails.

3. **No access control.** Any script — and any agent via inline python3 — can read/write the state file directly. State invariants aren't enforced. Multiple scripts and embedded python3 snippets inside markdown manipulate state independently.

4. **No guidance on failure.** When a transition fails, the bash script outputs a generic error. The agent has to rely on its prompt to figure out what to do next. The enforcement layer blocks but doesn't guide.

5. **No coding standards.** No CLAUDE.md. No documented conventions. Quality depends entirely on who's reviewing.

### Current State (Before)

```
hooks/hooks.json
  -> bash session-start-init.sh         <- writes state file directly
  -> bash persist-session-id.sh         <- writes session ID to env
  -> bash pre-tool-use-block-writes.sh  <- reads state file directly
  -> bash pre-tool-use-block-commits.sh <- reads sentinel file
  -> bash check-team-lead-identity.sh   <- reads env + transcript file
  -> bash pre-tool-use-state-inject.sh  <- reads state file directly
  -> bash subagent-start-inject.sh      <- reads state file directly
  -> bash teammate-idle-check.sh        <- reads state file directly

agents call:
  -> bash transition.sh <STATE>         <- reads/writes state, calls python3, calls git
  -> bash run-strict-lint.sh <files>    <- reads/writes state, calls eslint
  -> bash persist-session-id.sh         <- writes env file

agents also directly manipulate state via inline python3 in markdown:
  -> states/spawn.md              <- writes github_issue via python3
  -> states/planning.md           <- writes user_approved_plan, feature_branch via python3
  -> states/respawn.md            <- writes current_iteration_task via python3
  -> agents/feature-team-developer.md  <- writes developer_done, pr_number via python3
  -> commands/start-feature-team.md    <- creates state file via python3 fallback

Total: 10 bash scripts + ~8 inline python3 state mutations, 0 tests, 0 type safety
```

---

## 2. Design Principles

### P1: Strict, not flexible

This is a hardcoded workflow for producing high-quality code. Not a configurable framework. No configuration interfaces, no plugin system, no generic abstractions. The code IS the spec.

**Trade-off:** We can't reuse this for different workflows without forking. That's intentional — flexibility adds complexity we don't need.

### P2: Single entry point, private internals

ALL operations go through one public module: `autonomous-claude-agent-team-workflow.ts`. Hooks, agents, state updates — everything calls this one file. No agent ever touches the state file directly. No inline python3. Every operation has a meaningful workflow name — not generic CRUD.

**This replaces the current pattern where agents write state via python3:**

```
BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['developer_done']=True; ..."
AFTER:  node dist/workflow.js signal-done
```

```
BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['github_issue']=42; ..."
AFTER:  node dist/workflow.js record-issue 42
```

**Every operation describes what's happening in the workflow, not what data is being mutated.** `signal-done` says "the developer is signaling completion." `record-issue` says "we're recording which GitHub issue this feature implements." No `update-state`, no `set-field`, no generic CRUD.

**Trade-off:** Every operation pays routing overhead. Worth it for the access control guarantee.

### P3: 100% test coverage, enforced

Every line of TypeScript tested. Coverage thresholds set to 100% for lines, statements, functions, and branches. Tests fail the build if coverage drops.

**Trade-off:** Some defensive code paths require effort to test. We do it anyway — untested code is untrustworthy code.

### P4: Type safety

Zod schemas at boundaries. No `any`. No `as` (except `as const`). No `let`. The type system should make illegal states unrepresentable.

**Trade-off:** More upfront effort to model types correctly. Pays off immediately when refactoring.

### P5: Fail fast

Invalid state -> error with context. Missing data -> error with context. Never fallback silently. The error message format: `Expected [X]. Got [Y]. Context: [debugging info]`.

**Trade-off:** More errors during development. Fewer silent bugs in production.

### P6: Code guides, prompts assist

**Every command output tells the agent exactly what happened and what to do next.** The code is the primary guidance mechanism. Agent prompts (markdown files) are secondary — they provide principles and context, but the actual "what to do now" comes from command output.

This means:
- **Success output** includes next steps with exact commands to run
- **Error output** explains what's wrong, why, and the exact command to fix it
- **Block output** (from hooks) explains what's blocked, why the state forbids it, and what transition or action unblocks it
- **Agents never need to guess the next step** — the last command's output told them

```
BEFORE (current bash):
  Transitioned: PLANNING -> RESPAWN (iteration: 1)
  # Agent must consult its prompt to know what happens next

AFTER (TypeScript):
  RESPAWN (iteration: 1)
  ----------------------------------------------------------------
  Agents must be shut down and re-spawned with fresh context.

  1. Shut down developer and reviewer agents
  2. Read the GitHub issue and find the first unchecked iteration
  3. Set the iteration task:
       node "${PLUGIN_ROOT}/dist/workflow.js" assign-iteration-task "<task>"
  4. Transition to DEVELOPING:
       node "${PLUGIN_ROOT}/dist/workflow.js" transition DEVELOPING
```

```
BEFORE (current bash error):
  ERROR: Cannot transition to REVIEWING -- developer_done is not true.
  Developer must signal completion by writing developer_done: true to state file.
  # Agent must figure out the python3 command to write the field

AFTER (TypeScript error):
  Cannot transition to REVIEWING
  ----------------------------------------------------------------
  developerDone is false. Developer must signal completion first.

  Developer runs:
    node "${PLUGIN_ROOT}/dist/workflow.js" signal-done

  Then lead retries:
    node "${PLUGIN_ROOT}/dist/workflow.js" transition REVIEWING
```

```
BEFORE (hook block):
  {"decision":"block","reason":"Commits blocked during DEVELOPING"}
  # Agent knows it's blocked but not what to do about it

AFTER (hook block):
  {"decision":"block","reason":"Cannot commit during DEVELOPING.\n\nCommits are
  blocked until the reviewer approves changes.\nDeveloper must signal completion
  first, then lead transitions to REVIEWING.\n\nDeveloper runs:\n  node
  \"${PLUGIN_ROOT}/dist/workflow.js\" signal-done\n\nThen
  lead transitions:\n  node \"${PLUGIN_ROOT}/dist/workflow.js\" transition
  REVIEWING"}
```

**The principle:** If an agent does something wrong, the command output says exactly what is wrong, why the action is blocked, and what the agent needs to do instead. The system always hard-blocks invalid operations and redirects the agent to the correct action.

---

## 3. What We're Building

### 3.1 Architecture

This is a single-feature project — one vertical (the workflow plugin). The architecture follows SoC principles (domain never does I/O, dependencies point inward) but uses a flat structure proportionate to the project size. No features/ or platform/ nesting — this project doesn't have multiple features or cross-feature sharing.

```
                    +---------------------------------------------+
                    |  autonomous-claude-agent-team-workflow.ts     |
                    |  (PUBLIC -- CLI entrypoint, arg routing)      |
                    +----------------------+----------------------+
                                           | routes to
                    +----------------------v----------------------+
                    |         operations/                          |
                    |  transition, signal-done, record-issue,      |
                    |  record-branch, record-plan-approval,        |
                    |  assign-iteration-task, record-pr,           |
                    |  init, hooks, run-lint                       |
                    |  (orchestrate: load -> validate ->           |
                    |   apply -> format output)                    |
                    +----------+-----------+----------------------+
                               |           |
                    +----------v---+  +----v-----------------+
                    |   domain/    |  |     infra/            |
                    |  pure logic  |  |  state file I/O       |
                    |  no I/O      |  |  git/gh shell-out     |
                    |  no deps     |  |  hook I/O parsing     |
                    +--------------+  +----------------------+
```

### 3.2 Directory Structure

```
src/
|-- autonomous-claude-agent-team-workflow.ts  <- PUBLIC: CLI entrypoint, routes args to operations
|
|-- operations/                              <- orchestration layer (each file = one CLI subcommand)
|   |-- transition.ts                        <- load state -> check preconditions -> apply effects -> persist -> output guidance
|   |-- signal-done.ts                       <- [DEVELOPING only] set developerDone -> output guidance
|   |-- record-issue.ts                      <- [SPAWN only] set githubIssue -> output guidance
|   |-- record-branch.ts                     <- [PLANNING only] set featureBranch -> output guidance
|   |-- record-plan-approval.ts              <- [PLANNING only] set userApprovedPlan -> output guidance
|   |-- assign-iteration-task.ts             <- [RESPAWN only] set currentIterationTask -> output guidance
|   |-- record-pr.ts                         <- [PR_CREATION only] set prNumber -> output guidance
|   |-- init.ts                              <- create state file -> output confirmation (called by slash command)
|   |-- block-writes.ts                      <- read state -> check write rules -> return allow/block
|   |-- block-commits.ts                     <- read state (commitsBlocked) -> return allow/block
|   |-- verify-identity.ts                   <- parse transcript -> check lead prefix -> return allow/block/context
|   |-- inject-state-procedure.ts            <- read state -> load procedure markdown -> return context
|   |-- inject-subagent-context.ts           <- register agent in activeAgents + template context -> return context
|   |-- evaluate-idle.ts                     <- read state + agent role -> return allow/block
|   |-- handle-subagent-stop.ts        <- remove agent from activeAgents -> persist (SubagentStop event)
|   |-- run-lint.ts                          <- filter files -> run eslint -> record result -> output guidance
|
|-- domain/                                  <- pure business logic (no I/O, no dependencies)
|   |-- workflow-state.ts                    <- Zod schema, state names enum, WorkflowState type
|   |-- transition-map.ts                    <- legal transitions: Record<StateName, StateName[]>
|   |-- preconditions.ts                     <- per-transition validation (pure: takes state + git info, returns pass/fail+message)
|   |-- transition-effects.ts                <- post-transition state mutations (pure: takes state, returns new state)
|   |-- hook-rules.ts                        <- write blocking, commit blocking, idle enforcement rules
|   |-- identity-rules.ts                    <- LEAD: prefix pattern, emoji-state mapping, recovery detection
|   |-- state-procedure-map.ts               <- state name -> procedure markdown filename mapping
|   |-- operation-gates.ts                   <- per-operation state validation (signal-done only in DEVELOPING, etc.)
|   |-- event-log.ts                         <- event creation (operation + timestamp + key inputs)
|   |-- output-guidance.ts                   <- formats success/error/block messages with next-step commands
|
|-- infra/                                   <- I/O and external interactions
    |-- state-store.ts                       <- read/write JSON state file from ${CLAUDE_PLUGIN_ROOT}/
    |-- git.ts                               <- git shell-outs (branch, working tree, HEAD, diff)
    |-- github.ts                            <- gh shell-outs (pr checks)
    |-- hook-io.ts                           <- parse hook stdin JSON, format hook stdout JSON, exit codes
    |-- environment.ts                       <- CLAUDE_SESSION_ID, CLAUDE_PLUGIN_ROOT, paths
```

**Why this structure:**
- **29 source files** across 3 directories — proportionate to ~800 lines of bash becoming ~1800 lines of TypeScript
- **operations/** = one file per CLI subcommand. Every workflow operation named for what it does. If you know the operation, you know the file.
- **domain/** = pure functions, zero I/O. Every function testable with plain inputs and outputs. Includes `operation-gates.ts` for state-gating named operations.
- **infra/** = all I/O isolated. Mock this layer in tests, inject in operations. Unified state persistence — no sentinel files, no marker files.
- **No features/ or platform/ nesting** — this project is one feature. Complexity should earn directories, not the other way around. If a module grows past 250 lines, split it then.

### 3.3 Public Interface

The entrypoint is a CLI with subcommands. Every operation in the system routes through it.

**Named workflow operations (called by agents — replaces ALL inline python3):**

```bash
# Record which GitHub issue this feature implements (SPAWN only)
node dist/workflow.js record-issue 42

# Record the feature branch name (PLANNING only)
node dist/workflow.js record-branch "feature/add-invoice-42"

# Approve the implementation plan (PLANNING only)
node dist/workflow.js record-plan-approval

# Set the current iteration's task from the GitHub issue (RESPAWN only)
node dist/workflow.js assign-iteration-task "Iteration 1: Add PDF export"

# Developer signals work is complete (DEVELOPING only)
node dist/workflow.js signal-done

# Record the PR number after creation (PR_CREATION only)
node dist/workflow.js record-pr 17
```

**State transitions (called by lead agent):**

```bash
node dist/workflow.js transition PLANNING
node dist/workflow.js transition DEVELOPING
node dist/workflow.js transition REVIEWING
```

**State-gating:** Each named operation is gated to specific states. Calling `signal-done` outside of DEVELOPING produces:

```
Cannot signal-done
----------------------------------------------------------------
signal-done is only valid in DEVELOPING state.
Current state: REVIEWING

This operation is for the developer to signal that their work
is complete and ready for review.
```

**Operation state gates:**

| Operation | Allowed states | Who calls it |
|-----------|---------------|-------------|
| `record-issue` | SPAWN | Lead |
| `record-branch` | PLANNING | Lead |
| `record-plan-approval` | PLANNING | Lead |
| `assign-iteration-task` | RESPAWN | Lead |
| `signal-done` | DEVELOPING | Developer |
| `record-pr` | PR_CREATION | Developer |

**Hooks (called by hooks.json — agents never call these directly):**

```bash
node dist/workflow.js hook:block-writes
node dist/workflow.js hook:block-commits
node dist/workflow.js hook:verify-identity
node dist/workflow.js hook:inject-state
node dist/workflow.js hook:subagent-start
node dist/workflow.js hook:teammate-idle
node dist/workflow.js hook:subagent-stop
```

**Other operations:**

```bash
# Initialize state for a new feature team session (called by slash command)
node dist/workflow.js init

# Run lint on changed files (called by developer agent)
node dist/workflow.js run-lint file1.ts file2.ts
```

### 3.4 Hook I/O Contract

**Input:** Hooks receive JSON on stdin from Claude Code. All hook events share common fields:

```typescript
// Common fields on ALL hook events
const HookCommonInput = z.object({
  session_id: z.string(),
  transcript_path: z.string(),  // absolute path to conversation JSONL
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.string(),
})

// PreToolUse hooks additionally receive:
const PreToolUseInput = HookCommonInput.extend({
  tool_name: z.string(),
  tool_input: z.record(z.unknown()),
  tool_use_id: z.string(),
})

// SubagentStart hooks additionally receive:
const SubagentStartInput = HookCommonInput.extend({
  agent_name: z.string().optional(),
  agent_type: z.string().optional(),
})

// TeammateIdle hooks additionally receive:
const TeammateIdleInput = HookCommonInput.extend({
  teammate_name: z.string().optional(),
})

// SubagentStop hooks additionally receive:
const SubagentStopInput = HookCommonInput.extend({
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  agent_transcript_path: z.string().optional(),
  last_assistant_message: z.string().optional(),
})
```

**Output:** JSON to stdout. Format varies by hook event type.

```typescript
// PreToolUse: block via hookSpecificOutput (current API — the older "decision"/"reason" format is deprecated)
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Cannot commit during DEVELOPING. Developer must signal-done first."
  }
}

// PreToolUse: allow with injected context
{ "additionalContext": "..." }

// SubagentStart: context injection only (CANNOT block — see 3.15)
{ "additionalContext": "..." }

// TeammateIdle: exit code only (no JSON decision control)
// Exit 0 = allow idle, Exit 2 = block idle (stderr shown to user)

// Allow without context (no output needed)
```

**Exit codes:**
- `0` — hook completed (check stdout for decision)
- `2` — block the operation (PreToolUse: blocks tool use. TeammateIdle: blocks idle. SubagentStart: stderr shown but spawn NOT blocked)
- `1` — hook error (Claude Code treats as non-fatal, logs warning)

**Critical implementation detail:** Node.js `process.exit()` can truncate stdout. The entrypoint must flush stdout before exiting:

```typescript
process.stdout.write(output, () => process.exit(exitCode))
```

**Session ID propagation:** A minimal SessionStart hook persists `session_id` to `CLAUDE_ENV_FILE` so that agent-called CLI commands can read `CLAUDE_SESSION_ID` from the environment. This is infrastructure plumbing (14 lines), not state initialization. Hook-based operations read `session_id` directly from stdin JSON.

### 3.5 State Schema

```typescript
const StateName = z.enum([
  'SPAWN', 'PLANNING', 'RESPAWN', 'DEVELOPING', 'REVIEWING',
  'COMMITTING', 'CR_REVIEW', 'PR_CREATION', 'FEEDBACK',
  'BLOCKED', 'COMPLETE',
])

const EventLogEntry = z.object({
  op: z.string(),         // operation name: "transition", "signal-done", "record-issue", etc.
  at: z.string(),         // ISO 8601 timestamp
  detail: z.record(z.unknown()).optional(),  // key inputs (e.g., { to: "PLANNING" } or { issue: 42 })
})

const WorkflowState = z.object({
  state: StateName,
  iteration: z.number().int().nonnegative(),
  githubIssue: z.number().int().positive().optional(),
  featureBranch: z.string().optional(),
  developerDone: z.boolean(),
  lintRanIteration: z.number().int(),
  developingHeadCommit: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  userApprovedPlan: z.boolean(),
  currentIterationTask: z.string().optional(),
  activeAgents: z.array(z.string()),
  lintedFiles: z.array(z.string()),         // files that passed lint this iteration (BUG-3 fix)
  commitsBlocked: z.boolean(),              // replaces sentinel file
  preBlockedState: StateName.optional(),     // tracks state before BLOCKED (bug fix)
  eventLog: z.array(EventLogEntry),
})
```

**Event log (medium detail):** Every operation appends one entry. Contains operation name, timestamp, and key inputs — enough to trace what happened without replaying every mutation.

```json
{
  "eventLog": [
    { "op": "init", "at": "2026-02-28T10:00:00Z" },
    { "op": "transition", "at": "2026-02-28T10:00:01Z", "detail": { "to": "PLANNING" } },
    { "op": "record-issue", "at": "2026-02-28T10:01:00Z", "detail": { "issue": 42 } },
    { "op": "record-branch", "at": "2026-02-28T10:02:00Z", "detail": { "branch": "feature/add-invoice-42" } },
    { "op": "record-plan-approval", "at": "2026-02-28T10:03:00Z" },
    { "op": "transition", "at": "2026-02-28T10:03:01Z", "detail": { "to": "RESPAWN" } },
    { "op": "assign-iteration-task", "at": "2026-02-28T10:04:00Z", "detail": { "task": "Iteration 1: Add PDF export" } },
    { "op": "transition", "at": "2026-02-28T10:04:01Z", "detail": { "to": "DEVELOPING", "iteration": 1 } },
    { "op": "signal-done", "at": "2026-02-28T10:30:00Z" },
    { "op": "transition", "at": "2026-02-28T10:30:01Z", "detail": { "to": "REVIEWING" } },
    { "op": "run-lint", "at": "2026-02-28T10:35:00Z", "detail": { "files": 3, "pass": true } }
  ]
}
```

**On disk:** camelCase JSON. State files are ephemeral (`${CLAUDE_PLUGIN_ROOT}/feature-team-state-${SESSION_ID}.json`), session-scoped. No migration needed — new sessions create fresh files.

### 3.6 Transition Map

```typescript
// Maps each state to its legal TARGET states
const TRANSITION_MAP: Record<StateName, readonly StateName[]> = {
  SPAWN:       ['PLANNING'],
  PLANNING:    ['RESPAWN'],
  RESPAWN:     ['DEVELOPING'],
  DEVELOPING:  ['REVIEWING'],
  REVIEWING:   ['COMMITTING', 'DEVELOPING'],  // DEVELOPING = reviewer rejected
  COMMITTING:  ['RESPAWN', 'CR_REVIEW'],
  CR_REVIEW:   ['PR_CREATION'],
  PR_CREATION: ['FEEDBACK'],
  FEEDBACK:    ['COMPLETE', 'RESPAWN'],
  BLOCKED:     [],  // see below
  COMPLETE:    [],
}

// BLOCKED transitions:
// - ANY active state -> BLOCKED: always legal (saves preBlockedState)
// - BLOCKED -> preBlockedState: always legal (restores previous state)
// - BLOCKED -> any other state: ILLEGAL (must return to pre-blocked state)
```

### 3.7 Transition Preconditions

Each transition validates preconditions before proceeding. Preconditions are pure domain logic — they take state + git info and return pass/fail with a guidance message.

| Transition | Preconditions |
|------------|--------------|
| Any -> DEVELOPING | Current git branch must match `featureBranch`; `githubIssue` must be set |
| RESPAWN -> DEVELOPING | `currentIterationTask` must be set; `activeAgents` must be empty (all previous agents shut down) |
| DEVELOPING -> REVIEWING | `developerDone` must be true; unstaged changes must exist (git status --porcelain non-empty); no new commits since DEVELOPING started (HEAD matches `developingHeadCommit`) |
| PLANNING -> RESPAWN | `userApprovedPlan` must be true; working tree must be clean (no uncommitted changes) |
| COMMITTING -> RESPAWN or CR_REVIEW | Working tree must be clean; `lintRanIteration` must equal current `iteration`; all changed files must be in `lintedFiles` (BUG-3 fix); `git diff <defaultBranch>` must show commits exist |
| FEEDBACK -> COMPLETE | `prNumber` must be set; `gh pr checks <prNumber>` must pass |
| Any -> BLOCKED | Always legal (saves `preBlockedState`) |
| BLOCKED -> preBlockedState | Always legal (restores to pre-blocked state, clears `preBlockedState`) |
| BLOCKED -> any other state | ILLEGAL — must return to pre-blocked state |

All precondition failures produce guidance messages per P6 — explaining what's wrong, why, and the exact command to fix it.

### 3.8 Transition Effects

After a transition passes preconditions, effects mutate the state. Effects are pure domain logic — they take the current state and return the new state.

| Transition | Effects |
|------------|---------|
| RESPAWN -> DEVELOPING | Increment `iteration`; record `developingHeadCommit` as current HEAD; reset `developerDone` to false; set `commitsBlocked` to true; clear `lintedFiles` |
| REVIEWING -> DEVELOPING (rejection) | Reset `developerDone` to false; record `developingHeadCommit`; set `commitsBlocked` to true; clear `lintedFiles` |
| Any -> DEVELOPING/REVIEWING | Set `commitsBlocked` to true |
| Any -> COMMITTING | Set `commitsBlocked` to false |
| Any -> state other than DEVELOPING/REVIEWING | Set `commitsBlocked` to false |
| Any -> RESPAWN | Clear `currentIterationTask` to null |
| Any -> BLOCKED | Save current `state` as `preBlockedState` |
| BLOCKED -> preBlockedState | Clear `preBlockedState` |

### 3.9 Unified State Persistence

**Single file, no sentinels, no markers.**

All state lives in one JSON file: `${CLAUDE_PLUGIN_ROOT}/feature-team-state-${SESSION_ID}.json`

| Previous approach | New approach |
|-------------------|-------------|
| `feature-team-no-commit-${SESSION_ID}` sentinel file | `commitsBlocked: boolean` field in state JSON |
| `claude-feature-team-${SESSION_ID}` marker file | State file existence IS the marker |
| Separate event tracking nowhere | `eventLog: EventLogEntry[]` in state JSON |

**How hooks detect feature-team sessions:** Hooks check if the state file exists for the given `session_id`. If no state file exists, the session is not a feature team — hook exits immediately. This replaces the marker file check with a functionally identical check that doesn't require a separate file.

**Commit blocking:** `block-commits` reads `commitsBlocked` from the state file instead of checking for a sentinel file. `transition` sets/clears `commitsBlocked` as a side effect (entering DEVELOPING/REVIEWING = true, entering COMMITTING = false).

### 3.10 Build Pipeline

```
src/*.ts  ->  esbuild  ->  dist/workflow.js  (single bundled file)
```

- **esbuild** bundles all internal modules + Zod into one file (zero runtime dependencies)
- **Node builtins** (fs, child_process, path) marked external via `--platform=node`
- **Target:** Node 22, ESM format
- **`postinstall`** runs `pnpm build` automatically — clone + `pnpm install` = ready
- **Realistic startup:** 50-100ms per Node invocation with bundled file. 4 PreToolUse hooks = 200-400ms total, well within 5s timeout.

### 3.11 Project Configuration

**Adapted from living-architecture (linting THIS repo's TypeScript code):**

- `eslint.config.mjs` — strict rules: no any, no as, no let, no inline comments, max-depth 3, complexity 12, naming conventions, custom no-generic-names rule, vitest test rules
- `vitest.config.mts` — 100% coverage thresholds (lines, statements, functions, branches), v8 provider
- `tsconfig.json` — strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- `.prettierrc` — single quotes, no semicolons, 100 char width

**NOT adapted (not needed for single package):**

- NX workspace config, pnpm workspace, project references
- JSDoc enforcement (no public library API consumers)
- React/JSX/accessibility rules
- Dependency cruiser

**IMPORTANT: Two separate ESLint configs exist in this repo with different purposes:**

| Config | Location | Purpose |
|--------|----------|---------|
| `eslint.config.mjs` (root, new) | `/eslint.config.mjs` | Lints THIS repo's TypeScript source (`src/**/*.ts`) |
| `lint/eslint.config.mjs` (existing) | `/lint/eslint.config.mjs` | Lints TARGET project code (deployed plugin asset, run by `run-lint`) |

These are completely independent. The `lint/` directory is a deployed plugin asset — it is NOT modified by this PRD.

### 3.12 CLAUDE.md and Conventions

**CLAUDE.md** — project guide for AI and human developers. References:

- `docs/conventions/testing.md` — testing standards (TS-001 through TS-014)
- `docs/conventions/software-design.md` — design principles (SD-001 through SD-023)
- `docs/conventions/anti-patterns.md` — banned patterns (AP-002 through AP-008)
- `docs/conventions/standard-patterns.md` — Zod branded types, discriminated unions
- `docs/conventions/review-feedback-checks.md` — patterns learned from PR reviews

All conventions docs copied from living-architecture. Rules that reference concerns not present in this project (React, multi-package imports, NX operations) will be marked N/A rather than removed — they're the team's standards and may become relevant as the project grows.

### 3.13 Markdown Reference Updates

**All** markdown files that currently reference bash scripts or inline python3 must be updated:

**Script references -> entrypoint commands:**
```
BEFORE: bash "${CLAUDE_PLUGIN_ROOT}/scripts/transition.sh" DEVELOPING
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" transition DEVELOPING

BEFORE: bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-strict-lint.sh" <files>
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" run-lint <files>
```

**Inline python3 state writes -> named operations:**
```
BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['developer_done']=True; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" signal-done

BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['github_issue']=42; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" record-issue 42

BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['feature_branch']='feat/x'; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" record-branch "feat/x"

BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['user_approved_plan']=True; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" record-plan-approval

BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['current_iteration_task']='...'; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" assign-iteration-task "..."

BEFORE: python3 -c "import json; f=open('$STATE_FILE'); s=json.load(f); s['pr_number']=17; ..."
AFTER:  node "${CLAUDE_PLUGIN_ROOT}/dist/workflow.js" record-pr 17
```

**Subagent injection context:** The `inject-subagent-context.ts` operation generates the context string that agents receive at spawn. The new version includes named operation commands:

```
BEFORE (injected context):
  To signal completion: python3 -c "import json; ..."
  To run lint: bash $PLUGIN_ROOT/scripts/run-strict-lint.sh <files>

AFTER (injected context):
  To signal completion:
    node "${PLUGIN_ROOT}/dist/workflow.js" signal-done
  To run lint:
    node "${PLUGIN_ROOT}/dist/workflow.js" run-lint <files>
```

**Inline python3 state reads -> eliminated via injected context:**

`states/developing.md` contains a read-only python3 call to display `currentIterationTask`. This is eliminated by the `inject-state-procedure.ts` hook, which already injects state context including the current task. The inline query becomes unnecessary.

**Files requiring updates:**
- `agents/feature-team-lead.md` — transition command references
- `agents/feature-team-developer.md` — signal-done, run-lint, record-pr
- `agents/feature-team-reviewer.md` — lint script reference
- `states/spawn.md` — record-issue
- `states/planning.md` — record-plan-approval, record-branch
- `states/respawn.md` — assign-iteration-task
- `states/developing.md` — remove inline python3 read (replaced by injected context)
- `states/committing.md` — transition command reference
- `states/blocked.md` — update BLOCKED exit instructions to reflect BUG-1/BUG-2 fix (restricted to pre-blocked state)
- `commands/start-feature-team.md` — init command, remove python3 fallback
- Any other state files referencing `transition.sh` or `run-strict-lint.sh`

### 3.14 Known Bugs to Fix During Port

Bugs identified in the existing bash implementation. These are fixed as part of the TypeScript rewrite — not deferred to a separate PRD.

**BUG-1: BLOCKED -> any state bypasses all preconditions**

```bash
# Current behavior (transition.sh lines 72-73):
elif [ "$CURRENT_STATE" = "BLOCKED" ]; then
  : # returning from BLOCKED is always legal to any active state
```

An agent can transition from BLOCKED directly to COMPLETE, skipping every precondition check. This defeats the entire enforcement model.

**Fix:** Track `preBlockedState` when entering BLOCKED. Returning from BLOCKED only allows transition to the pre-blocked state. All preconditions for that transition still apply.

```
BEFORE: DEVELOPING -> BLOCKED -> COMPLETE  (bypasses all checks)
AFTER:  DEVELOPING -> BLOCKED -> DEVELOPING (only valid return)
        DEVELOPING -> BLOCKED -> COMPLETE   (ERROR: must return to DEVELOPING)
```

**BUG-2: No pre-BLOCKED state recorded**

When entering BLOCKED, the previous state isn't saved anywhere. Even if we fix BUG-1, there's no way to know which state to return to.

**Fix:** `preBlockedState` field in the state schema. Set on BLOCKED entry, cleared on BLOCKED exit.

**BUG-3: Stale lint check — lint could run on different files than committed**

```bash
# Current behavior (transition.sh lines 224-231):
if [ "$LINT_RAN_ITERATION" != "$CURRENT_ITERATION" ]; then
  echo "ERROR: Cannot transition from COMMITTING -- lint has not run this iteration."
```

The check verifies lint ran during this iteration, but not on the files being committed. Developer could lint `foo.ts`, then modify and commit `bar.ts`.

**Fix:** `lintedFiles: string[]` field in state schema. `run-lint` stores the full list of files that passed lint. At COMMITTING exit, verify that all changed files (via `git diff --name-only <defaultBranch>`) are a subset of `lintedFiles`. If not, error listing the unlinted files with the exact `run-lint` command to run. `lintedFiles` is cleared when entering DEVELOPING (fresh iteration = fresh lint).

**Scope boundary:** This fix catches "forgot to lint bar.ts" — it does NOT catch "modified foo.ts after linting it" (which would require content hashing). The iteration-scoped check is a sufficient improvement over the current "did lint run at all?" check.

**BUG-4: SubagentStart hooks cannot block agent spawning**

The current `subagent-start-inject.sh` uses exit code 2 to block duplicate agent spawns (e.g., spawning a second developer). However, Claude Code's SubagentStart hooks **cannot block** — exit code 2 only shows stderr to the user, it does not prevent the spawn.

This means the current duplicate-agent prevention is broken in the existing bash implementation. The exit code 2 may appear to work because the stderr message confuses the agent into thinking the spawn failed, but the subagent is actually created.

**Fix:** Accept that SubagentStart cannot block. Move enforcement to the injected context:
- `inject-subagent-context.ts` checks `activeAgents` for duplicates
- If a duplicate role is detected, inject a context message telling the new agent: "A {role} agent is already active. You must shut down immediately."
- The spawned agent receives this as its first context and should comply
- This is a best-effort enforcement (relies on agent cooperation), not a hard block

This is weaker than a hard block but is the only viable approach given the Claude Code hook API constraints. The existing bash has the same limitation — it just wasn't documented.

### 3.15 SubagentStart Behavior

The `inject-subagent-context.ts` operation does more than inject context. It:

1. **Registers the agent** — adds agent name to `activeAgents` and writes an event log entry
2. **Validates naming convention** — checks agent name matches `{role}-{iteration}` pattern
3. **Detects duplicate roles** — checks if the same role is already in `activeAgents`
4. **Templates context** — generates the role-specific context string with correct CLI commands

If duplicate detection or naming validation fails, the hook injects a warning into the context (it cannot block the spawn — see BUG-4). The agent receives the warning as part of its initial context.

### 3.16 Testing Strategy

**Test structure:** Co-located `.spec.ts` files alongside source files. Vitest with globals enabled.

**Domain layer (domain/):** Pure function tests. No mocking needed — pass inputs, assert outputs. This is where most edge case testing happens (precondition combinations, transition effects, blocking rules, operation gates, event log formatting).

**Operations layer (operations/):** Integration-style tests. Infra dependencies (state-store, git, hook-io) injected via function parameters, mocked in tests. Tests verify orchestration flow and output formatting (P6 guidance messages).

**Infra layer (infra/):** Thin wrapper tests. `state-store.ts` tested against real files in `.claude/plugins/autonomous-claude-agent-team/` (created and cleaned up per test). `git.ts` and `github.ts` tested with mocked `child_process.execSync`. `hook-io.ts` tested with string stdin simulation.

**Hook contract tests:** For each hook, fixture-based tests that provide stdin JSON and verify stdout JSON + exit code. These are the integration boundary between Claude Code and the TypeScript code.

**What we're NOT testing via manual full-workflow run:** The old "manual test: run full workflow SPAWN -> COMPLETE" criterion is replaced by automated integration tests. A manual smoke test MAY happen once after all automated tests pass, but it is not a gating criterion.

### 3.17 hooks.json Configuration

Updated hook registrations pointing to the TypeScript entrypoint:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:persist-session-id",
          "timeout": 5
        }]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:block-writes",
          "timeout": 5
        }]
      },
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:block-commits",
          "timeout": 5
        }]
      },
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:verify-identity",
          "timeout": 5
        }]
      },
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:inject-state",
          "timeout": 5
        }]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:subagent-start",
          "timeout": 5
        }]
      }
    ],
    "TeammateIdle": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:teammate-idle",
          "timeout": 5
        }]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [{
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/workflow.js\" hook:subagent-stop",
          "timeout": 5
        }]
      }
    ]
  }
}
```

**Key changes from current hooks.json:**
- SessionStart: Only persists session_id to env. State initialization removed (handled by `init` called from slash command).
- `TeammateTerminated` replaced by `SubagentStop`: `TeammateTerminated` is not a documented Claude Code hook event. `SubagentStop` is the stable, documented alternative that fires when a subagent finishes. Provides `agent_id`, `agent_type`, `agent_transcript_path`, and `last_assistant_message`.
- All hooks: bash scripts replaced with `node dist/workflow.js hook:<name>`.

---

## 4. What We're NOT Building

| Boundary | Rationale |
|----------|-----------|
| Configuration system for states/transitions | Strict, not flexible (P1). States are hardcoded. |
| Plugin/extension architecture | No third-party extensibility needed. |
| Changes to `lint/` directory | Deployed plugin asset for TARGET projects. Separate from repo-level ESLint. |
| Changes to agent/state-procedure content | Script paths and python3 references updated. `states/blocked.md` updated to reflect BUG-1/BUG-2 fix (restricted BLOCKED exit). All other substantive content frozen. |
| NX monorepo | Single package. NX overhead not justified. |
| CLI framework (yargs, commander) | Arg parsing is a switch statement. |
| New conventions docs | Copy from living-architecture only. No project-specific additions in this PRD. |
| New workflow states | Existing 11 states are ported as-is. |
| New agent roles | Same 3 agents: lead, developer, reviewer. |

**What we ARE doing beyond a direct port:**
- Fixing the 3 known bugs (Section 3.14)
- Adding state-gating to named operations (signal-done only in DEVELOPING, etc.)
- Adding event log for debuggability
- Adding richer output guidance (P6)
- Unifying temp files into single state JSON

---

## 5. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| All bash scripts deleted | 0 `.sh` files remain in `scripts/` and `hooks/` (except the 14-line session-id persistence hook) |
| All inline python3 eliminated | 0 `python3 -c` references in any `.md` file |
| 100% test coverage | vitest coverage report: 100% lines, statements, functions, branches |
| All lint rules pass | `pnpm lint` exits 0 |
| Type checks pass | `pnpm typecheck` exits 0 |
| Build succeeds | `pnpm build` produces `dist/workflow.js` |
| Single entry point enforced | All hooks.json commands and all markdown references route through `dist/workflow.js` |
| Hook contract tests pass | Fixture-based tests for every hook type verify stdin -> stdout + exit code |
| Integration tests pass | State transition sequences verified end-to-end with mocked git/gh |
| CLAUDE.md exists | File present at root with convention references |
| Error outputs include guidance | Every error/block message includes the exact command to fix the problem |
| Named operations state-gated | Each named operation rejects calls from wrong states with guidance |
| Event log populated | Every operation appends to eventLog with operation name, timestamp, key inputs |
| Known bugs fixed | BUG-1 (BLOCKED bypass), BUG-2 (preBlockedState), BUG-3 (stale lint) verified by tests |
| No sentinel/marker files | All state in single JSON file per session |

---

## 6. Open Questions

All resolved.

### OQ-1: Compiled JS vs tsx at runtime — RESOLVED

**Decision: Compiled JS via esbuild.** Compiled JS for hooks (50-100ms per invocation). Development uses vitest/tsx. `postinstall` auto-builds. No runtime dependencies — Zod bundled into `dist/workflow.js`.

### OQ-2: Separate PreToolUse hooks vs combined — RESOLVED

**Decision: Keep separate hooks.** 4 separate entries in hooks.json. Each has single responsibility. 200-400ms total per tool use is well within 5s timeout. Matches current behavior 1:1.

### OQ-3: State file field naming — RESOLVED

**Decision: camelCase on disk.** State files are ephemeral, session-scoped in `${CLAUDE_PLUGIN_ROOT}`. Nothing to migrate.

### OQ-4: Whitelist vs arbitrary fields for state updates — RESOLVED

**Decision: Named operations replace the whitelist concept entirely.** Instead of `update-state <field> <value>` with a whitelist, each field update is a named operation with its own state-gating. No generic update path exists. Unknown operations rejected at the CLI routing level.

### OQ-5: How do we handle the slash command? — RESOLVED

**Decision:** The slash command calls `node dist/workflow.js init` directly. This creates the state file with initial SPAWN state and event log. No SessionStart hook for state initialization. A minimal SessionStart hook (14 lines) persists `session_id` to `CLAUDE_ENV_FILE` for env var propagation — this is infrastructure plumbing, not state logic.

### OQ-6: Identity verification transcript parsing — RESOLVED

**Decision: Yes, keep it.** Research confirmed `transcript_path` is a common field available on ALL hook events including PreToolUse. The TypeScript version parses the transcript JSONL and applies the same `LEAD:` prefix pattern matching. Simpler in TypeScript than the current `tac`/`grep`/`sed` pipeline. Zod schema for transcript line entries validates the expected shape.

**Performance consideration:** Transcript files can grow large in long sessions. The implementation must read from the end of the file (like the current bash `tac` approach) rather than loading the entire file. Use `fs.openSync` + `fs.readSync` from the file end, or read only the last ~50KB to find the most recent assistant message. This keeps the hook well within the 5-second timeout.

**Key finding:** PreToolUse hooks do NOT receive `agent_name` or `agent_type` fields — those are only on SubagentStart, TeammateIdle, and SubagentStop events. Identity verification in PreToolUse must use either transcript parsing (for lead) or session-scoped state (for knowing which agents are active). The current approach is correct.

### OQ-7: 100% coverage for shell-out code — RESOLVED

**Decision: Dependency injection.** Operations receive infra as parameters. Tests mock the infra layer. Infra itself (`git.ts`, `github.ts`) has thin tests with mocked `child_process.execSync`.

### OQ-8: SessionStart hooks — RESOLVED

**Decision: Remove state initialization from SessionStart.** The slash command calls `init` directly. Keep only the minimal session-id persistence hook (writes to `CLAUDE_ENV_FILE`). This hook has no state logic — it's pure infrastructure for env var propagation.

### OQ-9: Known workflow bugs — RESOLVED

**Decision: Fix all bugs found during port.** Three bugs identified (Section 3.14): BLOCKED bypass, missing preBlockedState, stale lint check. All fixed in the TypeScript implementation with tests.

### OQ-10: Event log detail level — RESOLVED

**Decision: Medium detail.** Operation name + ISO timestamp + key inputs. Enough to trace what happened. Not a full state replay — the state file itself captures current state.

### OQ-11: run-lint approach — RESOLVED

**Decision: Shell out to eslint.** `run-lint.ts` constructs the eslint command and executes via `child_process.execSync`. Same approach as current bash, simpler than programmatic API, consistent with how `git.ts` and `github.ts` work.

---

## 7. Milestones

### M1: Build pipeline produces runnable artifact

After this milestone, the project has a working TypeScript build, enforced quality gates, documented coding standards, and a stub entrypoint that bundles to `dist/workflow.js`. Anyone can clone, install, and run `pnpm build && pnpm lint && pnpm typecheck && pnpm test` with all passing.

#### Deliverables

- **D1.1: Build pipeline**
  - `package.json` with scripts: `build`, `lint`, `typecheck`, `test`
  - `tsconfig.json` with strict settings from living-architecture (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, etc.)
  - esbuild config bundling `src/` to `dist/workflow.js` (ESM, Node 22, externalize node builtins)
  - `.prettierrc` from living-architecture
  - `postinstall` script runs `pnpm build`
  - Key scenarios: Fresh clone + `pnpm install` produces `dist/workflow.js`. `pnpm typecheck` exits 0 on strict settings.
  - Acceptance: `pnpm build` produces `dist/workflow.js`; `pnpm typecheck` exits 0
  - Verification: Run both commands, check exit codes and file existence

- **D1.2: ESLint configuration**
  - `eslint.config.mjs` adapted from living-architecture (flat config)
  - Rules: no any, no `as` (except `as const`), no `let`, no inline comments, max-depth 3, complexity 12, naming conventions, sonarjs, unicorn, stylistic formatting
  - Custom `no-generic-names` rule (copy from living-architecture)
  - Vitest test rules enabled for `*.spec.ts` files
  - Key scenarios: Valid code passes; `any` type fails; `as` cast fails; `let` declaration fails
  - Acceptance: `pnpm lint` exits 0 on stub src
  - Verification: `pnpm lint`

- **D1.3: Vitest configuration**
  - `vitest.config.mts` with 100% coverage thresholds (lines, statements, functions, branches)
  - v8 coverage provider
  - Globals enabled
  - Key scenarios: Tests run and report coverage; dropping below 100% fails the suite
  - Acceptance: `pnpm test` exits 0 with stub test file
  - Verification: `pnpm test`

- **D1.4: CLAUDE.md and conventions docs**
  - `CLAUDE.md` at project root — references conventions docs, build commands, project structure
  - `docs/conventions/testing.md` — TS-001 through TS-014
  - `docs/conventions/software-design.md` — SD-001 through SD-023
  - `docs/conventions/anti-patterns.md` — AP-002 through AP-008
  - `docs/conventions/standard-patterns.md` — SP-001, SP-002
  - `docs/conventions/review-feedback-checks.md` — RFC-001 through RFC-015
  - All copied from living-architecture. Rules referencing absent concerns (React, NX, multi-package) left as-is.
  - Acceptance: All files exist; CLAUDE.md references each convention doc
  - Verification: File existence; grep for doc references in CLAUDE.md

- **D1.5: Stub entrypoint**
  - `src/autonomous-claude-agent-team-workflow.ts` — prints usage/help when called with no args or unknown command
  - Builds successfully to `dist/workflow.js`
  - Acceptance: `node dist/workflow.js` runs, prints help, exits 0
  - Verification: `node dist/workflow.js`

### M2: State machine logic verified

After this milestone, all pure domain logic is implemented and tested — transitions, preconditions, effects, enforcement rules, identity patterns, operation gates, output formatting, and event logging. Zero I/O, zero mocking. Every function takes inputs and returns outputs. The domain layer IS the specification, verified by tests.

#### Deliverables

- **D2.1: State schema and types**
  - `src/domain/workflow-state.ts` — `StateName` enum, `WorkflowState` Zod schema, `EventLogEntry` schema
  - Tests: Valid state parses; invalid state rejects; each field type validated; edge cases (missing optional fields, wrong types, extra unknown fields stripped)
  - Acceptance: 100% coverage; schema matches Section 3.5
  - Verification: `pnpm test -- --testPathPattern workflow-state`

- **D2.2: Transition logic**
  - `src/domain/transition-map.ts` — `TRANSITION_MAP` constant, BLOCKED special case handling
  - `src/domain/preconditions.ts` — All 9 precondition checks from Section 3.7 as pure functions. Each takes state + git info (branch, working tree status, HEAD) and returns `{ pass: true }` or `{ pass: false, message: string }`
  - `src/domain/transition-effects.ts` — All effects from Section 3.8 as pure functions. Takes state, returns new state.
  - Tests: Every legal transition accepted; every illegal transition rejected; every precondition pass and fail path; every effect (iteration increment, developerDone reset, commitsBlocked toggle, preBlockedState save/clear, lintedFiles clear, currentIterationTask clear)
  - Edge cases: BLOCKED -> preBlockedState (BUG-1/BUG-2 fix); REVIEWING -> DEVELOPING (rejection cycle); COMMITTING with unlinted files (BUG-3)
  - Acceptance: 100% coverage; all transitions from Section 3.6-3.8 verified by tests
  - Verification: `pnpm test -- --testPathPattern domain/transition`

- **D2.3: Enforcement rules**
  - `src/domain/hook-rules.ts` — Write blocking rules (which states block which tools), commit blocking rules (commitsBlocked field check), idle enforcement rules (lead/developer/reviewer per state)
  - `src/domain/identity-rules.ts` — LEAD: prefix pattern matching, emoji-state mapping (11 states), recovery message generation, "never spoken" detection, "silent turn" detection
  - `src/domain/operation-gates.ts` — State validation for each of the 6 named operations (signal-done -> DEVELOPING only, etc.)
  - Tests: Every rule for every relevant state combination; every operation gate pass/fail; identity pattern matching with and without prefix; emoji mapping for all 11 states
  - Acceptance: 100% coverage
  - Verification: `pnpm test -- --testPathPattern domain/(hook-rules|identity-rules|operation-gates)`

- **D2.4: Output formatting and utilities**
  - `src/domain/output-guidance.ts` — Success/error/block message formatting with P6 next-step commands. Templates include `${PLUGIN_ROOT}` for CLI command paths.
  - `src/domain/event-log.ts` — Event entry creation (op + ISO timestamp + detail record)
  - `src/domain/state-procedure-map.ts` — State name to procedure filename mapping (lowercase + hyphenate convention)
  - Tests: Message formatting for every operation's success case and error cases; event log entry shape; state-to-filename mapping for all 11 states; missing procedure file handling
  - Acceptance: 100% coverage; every error message includes an actionable next command
  - Verification: `pnpm test -- --testPathPattern domain/(output-guidance|event-log|state-procedure-map)`

### M3: All operations execute end-to-end

After this milestone, every CLI subcommand works — named operations, transition, hooks, run-lint, and the CLI entrypoint routing. Hook contract tests verify the integration boundary with Claude Code. Integration tests verify multi-step transition sequences. The infra layer is tested with mocked I/O.

#### Deliverables

- **D3.1: Infra layer**
  - `src/infra/state-store.ts` — Read/write JSON state file; atomic write (write to temp, rename); Zod validation on read
  - `src/infra/git.ts` — Shell-outs: current branch, working tree status (porcelain), HEAD commit, diff stat, diff name-only, default branch detection
  - `src/infra/github.ts` — Shell-out: `gh pr checks <number>`
  - `src/infra/hook-io.ts` — Parse stdin JSON via Zod schemas (per hook type); format stdout JSON (`hookSpecificOutput` for PreToolUse, `additionalContext` for others); exit code mapping
  - `src/infra/environment.ts` — `CLAUDE_SESSION_ID`, `CLAUDE_PLUGIN_ROOT`, state file path derivation, `CLAUDE_ENV_FILE`
  - Tests: `state-store` against real files in `.claude/plugins/autonomous-claude-agent-team/` (create/cleanup per test); `git`/`github` with mocked `execSync`; `hook-io` with string stdin simulation; `environment` with mocked `process.env`
  - Edge cases: Corrupted JSON state file; missing state file; empty stdin; git command failure; missing env vars
  - Acceptance: 100% coverage; state-store does atomic writes
  - Verification: `pnpm test -- --testPathPattern infra/`

- **D3.2: Named workflow operations**
  - `src/operations/signal-done.ts` — [DEVELOPING only] set developerDone, log event, output guidance
  - `src/operations/record-issue.ts` — [SPAWN only] set githubIssue, log event, output guidance
  - `src/operations/record-branch.ts` — [PLANNING only] set featureBranch, log event, output guidance
  - `src/operations/record-plan-approval.ts` — [PLANNING only] set userApprovedPlan, log event, output guidance
  - `src/operations/assign-iteration-task.ts` — [RESPAWN only] set currentIterationTask, log event, output guidance
  - `src/operations/record-pr.ts` — [PR_CREATION only] set prNumber, log event, output guidance
  - `src/operations/init.ts` — Create state file with SPAWN defaults, empty event log, log init event, output confirmation
  - Each operation: validates state gate via domain; updates field via infra; appends event log; outputs P6 guidance
  - Tests (per operation): Correct state -> success with guidance message; wrong state -> error with guidance; invalid input (wrong type, empty string, negative number) -> error
  - Acceptance: 100% coverage; every error message includes exact command to fix
  - Verification: `pnpm test -- --testPathPattern operations/(signal|record|assign|init)`

- **D3.3: Transition operation**
  - `src/operations/transition.ts` — Load state -> check transition legality -> check preconditions -> apply effects -> persist -> output guidance
  - Infra dependencies injected (state-store, git, sentinel) — mocked in tests
  - Tests: Every legal transition with realistic mocked git state; every precondition failure with P6 guidance; BLOCKED entry/exit with preBlockedState (BUG-1/BUG-2); stale lint files rejection (BUG-3)
  - Edge cases: Transition from COMPLETE (only BLOCKED legal); transition from BLOCKED to wrong state; concurrent state modification (last-write-wins accepted)
  - Acceptance: 100% coverage; all 3 bug fixes verified
  - Verification: `pnpm test -- --testPathPattern operations/transition`

- **D3.4: Hook operations**
  - `src/operations/block-writes.ts` — Read state, apply write blocking rules per state (RESPAWN blocks file writes including git)
  - `src/operations/block-commits.ts` — Read state, check `commitsBlocked` field
  - `src/operations/verify-identity.ts` — Read transcript (from end, last ~50KB), parse JSONL, check LEAD: prefix, inject recovery if lost. Uses `hookSpecificOutput` format for blocking, stderr for recovery context.
  - `src/operations/inject-state-procedure.ts` — Read state, load procedure markdown, substitute `${CLAUDE_PLUGIN_ROOT}`, validate branch matches featureBranch, inject warning if mismatched
  - `src/operations/inject-subagent-context.ts` — Register agent in activeAgents, validate naming, detect duplicate roles, template role-specific context with CLI commands (see Section 3.15)
  - `src/operations/evaluate-idle.ts` — Read state + agent role, apply idle rules (lead cannot idle except BLOCKED/COMPLETE; developer cannot idle during DEVELOPING without signaling done; reviewer: no restrictions)
  - `src/operations/handle-subagent-stop.ts` — Remove agent from activeAgents, log event, persist
  - Tests (per hook): Fixture-based stdin JSON -> stdout JSON + exit code; state-dependent behavior; edge cases (no state file -> early exit, unknown agent name -> graceful handling)
  - Acceptance: 100% coverage; `hookSpecificOutput` format used for PreToolUse blocking
  - Verification: `pnpm test -- --testPathPattern operations/(block|verify|inject|evaluate|handle)`

- **D3.5: run-lint operation**
  - `src/operations/run-lint.ts` — Accept file list, filter to `.ts`/`.tsx`, shell out to eslint, store `lintedFiles` in state, update `lintRanIteration`, log event, output guidance
  - Tests: Files filtered correctly; lint pass -> success guidance; lint fail -> error with details; empty file list -> pass (matches current behavior); auto-install check for eslint dependencies
  - Acceptance: 100% coverage
  - Verification: `pnpm test -- --testPathPattern operations/run-lint`

- **D3.6: CLI entrypoint and integration tests**
  - `src/autonomous-claude-agent-team-workflow.ts` — Route CLI args to operations. Handle: `transition <state>`, `signal-done`, `record-issue <number>`, `record-branch <name>`, `record-plan-approval`, `assign-iteration-task <task>`, `record-pr <number>`, `init`, `run-lint <files...>`, `hook:block-writes`, `hook:block-commits`, `hook:verify-identity`, `hook:inject-state`, `hook:subagent-start`, `hook:teammate-idle`, `hook:subagent-stop`, `hook:persist-session-id`. Unknown command -> error with available commands list. Flush stdout before exit.
  - Hook contract test suite: For each of the 7 hook types, fixture-based tests providing realistic stdin JSON and verifying exact stdout JSON shape + exit code
  - Integration test suite: Multi-step sequences (SPAWN -> PLANNING -> RESPAWN -> DEVELOPING full cycle) with mocked infra
  - Acceptance: 100% coverage; every subcommand routed correctly; unknown commands rejected with help
  - Verification: `pnpm test`; `pnpm build && node dist/workflow.js` prints help

### M4: Bash eliminated

After this milestone, all hooks point to TypeScript, all markdown files reference the new CLI commands, all bash scripts are deleted, and every success criterion from Section 5 is verified. The plugin is fully functional.

#### Deliverables

- **D4.1: hooks.json update**
  - `hooks/hooks.json` matches Section 3.17 specification
  - SessionStart: persist-session-id only
  - PreToolUse: 4 hooks (block-writes, block-commits, verify-identity, inject-state)
  - SubagentStart, TeammateIdle, SubagentStop: 1 hook each
  - Acceptance: hooks.json matches spec exactly
  - Verification: Diff against Section 3.17

- **D4.2: Markdown file updates**
  - All files from Section 3.13 list updated
  - All `python3 -c` references replaced with named CLI operations
  - All `bash scripts/` references replaced with `node dist/workflow.js` commands
  - `states/blocked.md` updated: BLOCKED exit restricted to pre-blocked state (BUG-1/BUG-2)
  - `states/developing.md` inline python3 read removed (replaced by injected context)
  - Acceptance: `grep -r "python3 -c" agents/ states/ commands/` returns empty; `grep -r "scripts/transition" agents/ states/ commands/` returns empty
  - Verification: Run grep commands

- **D4.3: Bash script deletion**
  - Delete: `scripts/transition.sh`, `scripts/run-strict-lint.sh`, `scripts/persist-session-id.sh`, `scripts/check-team-lead-identity.sh`
  - Delete: `hooks/session-start-init.sh`, `hooks/pre-tool-use-block-writes.sh`, `hooks/pre-tool-use-block-commits.sh`, `hooks/pre-tool-use-state-inject.sh`, `hooks/subagent-start-inject.sh`, `hooks/teammate-idle-check.sh`, `hooks/teammate-terminated.sh`
  - Acceptance: 0 `.sh` files in `scripts/` and `hooks/`
  - Verification: `find scripts/ hooks/ -name "*.sh" | wc -l` returns 0

- **D4.4: Final verification**
  - Run every success criterion from Section 5
  - All 15 criteria must pass
  - Acceptance: All measurements from Section 5 verified
  - Verification: Execute each measurement command sequentially

---

## 8. Parallelization

After M1 completes (shared dependency), Track A and Track B can proceed in parallel. Track B (infra layer) is independent of domain logic. When both complete, operations (D3.2+) require both domain types and infra interfaces. M4 is sequential after M3.

```yaml
tracks:
  - id: A
    name: Domain + Operations + Wiring
    deliverables:
      - M1
      - D2.1
      - D2.2
      - D2.3
      - D2.4
      - D3.2
      - D3.3
      - D3.4
      - D3.5
      - D3.6
      - M4
  - id: B
    name: Infrastructure
    deliverables:
      - D3.1
```

**Dependency graph:**
```
M1 ──┬──> D2.1 -> D2.2 ──┬──> D2.4 ──┬──> D3.2 -> D3.3 -> D3.4 -> D3.5 -> D3.6 -> M4
     │                    │           │
     │    D2.3 <──────────┘           │
     │                                │
     └──> D3.1 ───────────────────────┘
```

- **M1** is the gate — nothing starts without build pipeline
- **D2.1** (schema) is foundational — all domain and operations depend on it
- **D2.2** and **D2.3** can overlap after D2.1 (transition logic and enforcement rules are partially independent)
- **D3.1** (infra) runs in parallel with all of M2 — it only depends on M1
- **D3.2+** (operations) need both domain (M2) and infra (D3.1) complete
- **M4** (wiring/cleanup) is the final sequential step

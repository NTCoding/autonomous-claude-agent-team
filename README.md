# autonomous-claude-agent-team

> **This is a specific, working example — not a flexible framework.** It is a Claude Code plugin that implements one concrete workflow for building features with a team of AI agents. This is an example to show how you can build your own hook-driven workflow-as-code.

A hook-driven state machine for orchestrating three Claude Code agents — a lead, a developer, and a reviewer — through a structured feature development cycle.

![Agent team session](docs/agent-team-session.png)

## What it is

Three agents work through a fixed cycle:

- **Lead** coordinates. Never writes or reviews code. Can only stop in BLOCKED or COMPLETE.
- **Developer** implements via TDD, runs strict lint, and signals done by writing to a state file. Cannot go idle without signalling.
- **Reviewer** runs `git diff` on uncommitted changes, runs typecheck/build/tests/lint, and returns APPROVED or REJECTED.

Every session is tracked by a **GitHub issue**. The PR is always created as a **draft** — this workflow never opens it. **CodeRabbit** reviews before humans do.

Hooks enforce the rules mechanically. The lead can't skip states, the developer can't commit before review, and no agent can stop at the wrong moment. This matters because LLMs are unreliable self-enforcers — hooks are code and can't be argued with.

## How it works

```mermaid
flowchart LR
    SPAWN --> PLANNING
    PLANNING --> RESPAWN
    RESPAWN --> DEVELOPING
    DEVELOPING --> REVIEWING
    REVIEWING -->|approved| COMMITTING
    REVIEWING -->|rejected| DEVELOPING
    COMMITTING -->|next iteration| RESPAWN
    COMMITTING -->|done| CR_REVIEW
    CR_REVIEW --> PR_CREATION
    PR_CREATION --> FEEDBACK
    FEEDBACK --> COMPLETE
```

RESPAWN happens at the start of **every** iteration. It shuts down the existing developer and reviewer and spawns fresh agents with only the plan and iteration context. This clears their context windows deliberately — accumulated noise from earlier iterations pollutes decisions in later ones.

**State file** at `/tmp/feature-team-state-${CLAUDE_SESSION_ID}.json` is the source of truth:

```json
{
  "state": "DEVELOPING",
  "iteration": 2,
  "githubIssue": 42,
  "featureBranch": "feature/my-feature",
  "developerDone": false,
  "lintRanIteration": 1,
  "developingHeadCommit": "abc123",
  "prNumber": 17,
  "userApprovedPlan": true,
  "currentIterationTask": "Iteration 2: Add PDF rendering for line items",
  "activeAgents": ["feature-team-developer", "feature-team-reviewer"],
  "lintedFiles": ["src/invoice/pdf-renderer.ts"],
  "commitsBlocked": true,
  "preBlockedState": null,
  "eventLog": [
    { "op": "transition", "at": "2024-01-15T10:00:00Z", "detail": { "from": "PLANNING", "to": "RESPAWN" } }
  ]
}
```

**`/autonomous-claude-agent-team:workflow transition <STATE>`** is the only way the lead changes state. Pre-conditions enforced:

| Transition                       | Pre-condition                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Any → DEVELOPING                 | Feature branch (not main/master), `githubIssue` set in state file                        |
| DEVELOPING → REVIEWING           | `developer_done: true`, unstaged changes exist, no commits added since DEVELOPING started |
| COMMITTING → RESPAWN / CR_REVIEW | Working tree clean, lint ran this iteration, commits exist beyond default branch          |
| FEEDBACK → COMPLETE              | `prNumber` set in state file, all PR checks passing (`gh pr checks`)                     |

**Hooks:**

- `SessionStart` — persists `CLAUDE_SESSION_ID` to env
- `PreToolUse` — blocks plugin reads; blocks writes during RESPAWN; blocks commits during DEVELOPING/REVIEWING; validates lead identity; injects current state procedure before every lead tool call
- `SubagentStart` — injects iteration, issue, and state context into spawned agents at startup; registers agent in active agents list
- `TeammateIdle` — blocks developer going idle in DEVELOPING without signalling done; blocks lead going idle in any state except BLOCKED or COMPLETE

## What you need to know

**Starting a session:**

```
/start-feature-team
```

**What the lead will ask you for:**

- Reference documents (spec, existing code pointers, architecture notes)
- Plan approval before any code is written
- Decisions when the team is BLOCKED

**Signals you'll see:**

| Prefix                              | Meaning                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `🟣 LEAD: SPAWN`                    | Creating GitHub issue and spawning the team                                                          |
| `⚪ LEAD: PLANNING`                 | Reading docs, drafting plan with team — needs your approval                                          |
| `🔄 LEAD: RESPAWN`                  | Shutting down agents and spawning fresh ones for the next iteration                                  |
| `🔨 LEAD: DEVELOPING (Iteration N)` | Lead has assigned work; developer is implementing                                                    |
| `📋 LEAD: REVIEWING`                | Reviewer is running `git diff`, typecheck, build, tests, and lint on uncommitted changes             |
| `💾 LEAD: COMMITTING`               | Review approved; developer commits and pushes, lead decides whether to iterate or proceed to CR      |
| `🐰 LEAD: CR_REVIEW`                | Developer runs CodeRabbit review on the committed branch and addresses all findings                  |
| `🚀 LEAD: PR_CREATION`              | Developer creates the draft PR; lead waits for CI to pass before notifying you                       |
| `💬 LEAD: FEEDBACK`                 | Lead triages your review comments with the team: accept, reject (with reasoning), or escalate to you |
| `⚠️ LEAD: BLOCKED`                  | Team is paused — lead will tell you exactly what is needed                                           |
| `✅ LEAD: COMPLETE`                 | Draft PR exists, all CI checks pass — ready for your review                                          |

**Done = draft PR + all CI checks passing + ready for your review.** The lead cannot reach COMPLETE unless `gh pr checks` passes. The PR stays a draft — you decide what to do with it.

**If something goes wrong:**

- The lead transitions to BLOCKED and explains what is needed
- State is preserved on session resume — each session ID has its own state file in `/tmp`
- To inspect current state from within a Claude session: `cat "/tmp/feature-team-state-${CLAUDE_SESSION_ID}.json"`

---

## Installation

**Prerequisites:**

- Node.js 20+ with `npx` available on PATH (hooks execute via `npx tsx`)
- [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams) must be enabled (experimental — requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in settings)

**Option A — Install directly from GitHub (recommended)**

No cloning or building needed. Claude Code installs and manages it for you:

```sh
/plugin marketplace add NTCoding/autonomous-claude-agent-team
```

**Option B — Install from a local clone**

Use this if you want to modify the plugin:

```sh
git clone https://github.com/NTCoding/autonomous-claude-agent-team \
  /path/to/autonomous-claude-agent-team
cd /path/to/autonomous-claude-agent-team
pnpm install   # installs deps
/plugin marketplace add file:///absolute/path/to/autonomous-claude-agent-team
```

Claude Code sets `CLAUDE_PLUGIN_ROOT` to the plugin directory and loads
`hooks/hooks.json` automatically. All hook events dispatch to:

```
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/autonomous-claude-agent-team-workflow.ts"
```

**4. Verify**

Start a new Claude Code session and run `/start-feature-team`. The lead should
initialise the state file and announce `🟣 LEAD: SPAWN`.

---

## Plugin structure

```
autonomous-claude-agent-team/
├── agents/               # Agent definitions
│   ├── feature-team-lead.md
│   ├── feature-team-developer.md
│   └── feature-team-reviewer.md
│
├── states/               # State procedures — injected by PreToolUse hook on demand
│   ├── spawn.md, planning.md, respawn.md, developing.md, reviewing.md
│   ├── committing.md, cr-review.md, pr-creation.md, feedback.md
│   └── blocked.md, complete.md
│
├── commands/
│   └── start-feature-team.md  # Entry point slash command
│
├── hooks/
│   └── hooks.json             # 4 hook events → npx tsx src/autonomous-claude-agent-team-workflow.ts
│
├── src/                  # TypeScript workflow engine
│   ├── autonomous-claude-agent-team-workflow.ts  ← CLI + hook entry point
│   ├── operations/       ← one file per command/hook operation
│   ├── domain/           ← pure business logic, no I/O
│   └── infra/            ← all I/O isolated here
│
└── lint/
    ├── eslint.config.mjs
    └── no-generic-names.js
```

**Why state procedures are separate files:** The lead agent definition stays ~150 lines. Full procedure for all 11 states would be 1000+ lines loaded into every tool call. The `PreToolUse` hook reads only the current state's file and injects it as `additionalContext`. The lead gets the right instructions at the right time without carrying irrelevant baggage.

**Why the GitHub issue is mandatory:** `/autonomous-claude-agent-team:workflow transition` blocks `Any → DEVELOPING` without `githubIssue` set. Every session must have a ticket before a line of code is written.

**Why the PR must be a draft:** The workflow never opens the PR. It creates a draft and hands off to you. What you do with it is your decision.

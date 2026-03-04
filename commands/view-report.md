Two-phase command. Follow the phases in order.

## Phase 1 — Get session data

Run:

```bash
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" npx tsx "${CLAUDE_PLUGIN_ROOT}/src/autonomous-claude-agent-team-workflow.ts" view-report $ARGUMENTS
```

Read the output. Analyze the session data. Write your analysis to $TMPDIR/analysis.md using this format:

```
## ⚠ Warning title
Evidence text explaining the issue.

Continue: workflow analyze <session-id>
Detailed prompt for follow-up analysis.

## ℹ Informational title
Evidence text.

## ✓ Success title
Evidence text.

## 💡 Suggestion title
Rationale explaining why.

**Change:** Specific change to make.

**Trade-off:** Trade-off to consider.

Continue: workflow analyze <session-id>
Follow-up prompt.
```

Use ⚠ for warnings, ℹ for informational, ✓ for positive findings, 💡 for suggestions. Focus on key issues, bottlenecks, and actionable recommendations. Skip "what went well" unless it's a notable success.

## Phase 2 — Generate report

Run:

```bash
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" npx tsx "${CLAUDE_PLUGIN_ROOT}/src/autonomous-claude-agent-team-workflow.ts" view-report $ARGUMENTS --render $TMPDIR/analysis.md
```

This generates the HTML report with your analysis embedded and opens it in the browser.

## Simple mode (no AI analysis)

Run:

```bash
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" npx tsx "${CLAUDE_PLUGIN_ROOT}/src/autonomous-claude-agent-team-workflow.ts" view-report $ARGUMENTS --simple
```

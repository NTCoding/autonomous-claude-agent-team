# Review Feedback Checks

Patterns learned from PR reviews. Check these before submitting.

## RFC-001: Every error message includes the exact command to fix it

```
// ✗ unhelpful
Cannot transition to REVIEWING

// ✓ actionable
Cannot transition to REVIEWING
----------------------------------------------------------------
developerDone is false. Developer must signal completion first.

Developer runs:
  node "${PLUGIN_ROOT}/dist/workflow.js" signal-done

Then lead retries:
  node "${PLUGIN_ROOT}/dist/workflow.js" transition REVIEWING
```

## RFC-002: State gates reject wrong states with guidance

Named operations must reject calls from wrong states:
```
Cannot signal-done
----------------------------------------------------------------
signal-done is only valid in DEVELOPING state.
Current state: REVIEWING
```

## RFC-003: Hook output uses hookSpecificOutput format for PreToolUse blocking

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "..."
  }
}
```

## RFC-004: Flush stdout before process.exit()

```typescript
process.stdout.write(output, () => process.exit(exitCode))
```

Node.js `process.exit()` can truncate stdout. Always flush first.

## RFC-005: State file atomic writes

Write to temp file, rename to target. Prevents partial writes.

## RFC-006: BLOCKED transitions save preBlockedState

When entering BLOCKED, save `preBlockedState`. When leaving BLOCKED,
only allow transition to `preBlockedState`.

## RFC-007: lintedFiles tracks per-file lint status

Not just `lintRanIteration`. Every changed file must be in `lintedFiles`.

## RFC-008: Transcript parsing reads from end

Identity verification reads the last ~50KB of transcript, not the full file.

## RFC-009: SubagentStart cannot block spawning

Exit code 2 on SubagentStart shows stderr but does NOT prevent spawn.
Use injected context to warn duplicate agents instead.

## RFC-010: commitsBlocked replaces sentinel file

The `commitsBlocked` field in state JSON replaces the
`feature-team-no-commit-${SESSION_ID}` sentinel file.

## RFC-011: Session detection uses state file existence

Hooks check `state file exists for session_id`. No separate marker file.

## RFC-012: Operations use workflow vocabulary

`signal-done` not `set-developer-done`. Domain vocabulary, not CRUD.

## RFC-013: Preconditions are pure domain logic

No I/O in preconditions. Take state + git info as parameters, return pass/fail.

## RFC-014: Effects are pure domain logic

No I/O in effects. Take state, return new state.

## RFC-015: Event log captures every operation

Every operation appends `{ op, at, detail }` to `eventLog`.

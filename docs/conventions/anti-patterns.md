# Anti-Patterns

## AP-001: Direct state file mutation

Never write to the state JSON file directly via python3 or bash.
Always use named operations through `dist/workflow.js`.

## AP-002: Silent fallbacks in error paths

```typescript
// ✗ hides bugs
return value ?? 'default'

// ✓ exposes bugs
if (!value) throw new WorkflowError(`Expected value`)
return value
```

## AP-003: Generic type escape hatches

`any`, `as SomeType`, `as unknown as SomeType`, `@ts-ignore` are banned.
They hide bugs the type system would have caught.

## AP-004: Shared mutable state

Operations read state, compute new state, write new state atomically.
No shared in-memory state between operations.

## AP-005: Bash logic in hooks

Hooks call `node dist/workflow.js hook:<name>`. No business logic in bash.

## AP-006: Sentinel files

All state lives in one JSON file per session. No marker files, no sentinel files.

## AP-007: Inline python3 state writes

```bash
# ✗ bypasses all validation
python3 -c "import json; ... state['developer_done'] = True ..."

# ✓ enforced and validated
node "${PLUGIN_ROOT}/dist/workflow.js" signal-done
```

## AP-008: Skipping test coverage

100% coverage is not negotiable. Every branch needs a test.

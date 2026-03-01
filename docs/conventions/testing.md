# Testing Conventions

## TS-001: Test names describe outcomes, not actions

Pattern: `[outcome] when [condition]`

```
✓ returns empty array when input is null
✓ throws ValidationError when email format is invalid
✗ test null input
✗ should work
```

## TS-002: One concept per test

Each test verifies one behavior. Split if the name needs "and".

## TS-003: Assert specific values, not types

```typescript
// ✗ weak
expect(result).toBeDefined()

// ✓ strong
expect(result).toStrictEqual({ status: 'success', count: 3 })
```

## TS-004: Assertions must match test titles

If the test says "generates different IDs", assert `id1 !== id2`, not `array.length === 2`.

## TS-005: Use `it()` not `test()`

Consistent with `vitest/consistent-test-it` rule.

## TS-006: Max 4 `expect()` calls per test

Enforced by `vitest/max-expects`. Split into multiple tests if needed.

## TS-007: Use `toStrictEqual()` not `toEqual()`

`toStrictEqual` checks object types. `toEqual` does not.

## TS-008: Arrange-Act-Assert structure

Three clear sections: set up data, execute, verify outcome.

## TS-009: Co-locate tests with source

`domain/workflow-state.spec.ts` lives next to `domain/workflow-state.ts`.

## TS-010: No mocking of domain functions

Domain is pure logic. Pass inputs, assert outputs. No mocks needed.

## TS-011: Mock infra at operation boundaries

Operations receive infra as parameters. Tests provide mock implementations.

## TS-012: Test every precondition branch

Each `{ pass: false }` path needs a dedicated test.

## TS-013: Test every effect combination

Each transition effect needs before/after state assertions.

## TS-014: 100% coverage enforced by CI

Lines, statements, functions, branches. No exceptions.

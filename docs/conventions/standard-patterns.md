# Standard Patterns

## SP-001: Zod branded types for validated values

```typescript
const PositiveInt = z.number().int().positive().brand('PositiveInt')
type PositiveInt = z.infer<typeof PositiveInt>
```

Use branded types to make invalid values unrepresentable at type boundaries.

## SP-002: Discriminated unions for operation results

```typescript
type PreconditionResult =
  | { pass: true }
  | { pass: false; message: string }
```

Discriminated unions force exhaustive handling. No optional fields that
might or might not be present based on runtime state.

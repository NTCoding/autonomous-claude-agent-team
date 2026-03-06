import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/dsl/index.ts',
        'src/dsl/domain/types.ts',
        'src/engine/index.ts',
        'src/event-store/index.ts',
        'src/testing/index.ts',
        'src/testing/domain/types.ts',
        'src/engine/domain/transcript-reader.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
})

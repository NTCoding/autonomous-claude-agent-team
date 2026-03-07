import { describe, it, expect } from 'vitest'
import { defineHooks } from './hook-definition.js'
import { pass } from '../../dsl/index.js'

describe('defineHooks', () => {
  it('returns the hooks definition unchanged', () => {
    const hooks = {
      preToolUse: {
        Bash: {
          extract: () => ({ command: 'ls' }),
          check: () => pass(),
        },
      },
    }
    const result = defineHooks(hooks)
    expect(result).toBe(hooks)
  })
})

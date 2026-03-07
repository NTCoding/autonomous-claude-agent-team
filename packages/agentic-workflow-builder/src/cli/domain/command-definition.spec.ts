import { describe, it, expect } from 'vitest'
import { defineCommands } from './command-definition.js'
import { pass } from '../../dsl/index.js'

describe('defineCommands', () => {
  it('returns the commands map unchanged', () => {
    const commands = {
      init: {
        type: 'session-start' as const,
      },
      doSomething: {
        type: 'transaction' as const,
        handler: () => pass(),
      },
    }
    const result = defineCommands(commands)
    expect(result).toBe(commands)
  })
})

import { describe, it, expect } from 'vitest'
import { defineRoutes } from './command-definition.js'
import { pass } from '../../dsl/index.js'

describe('defineRoutes', () => {
  it('returns the routes map unchanged', () => {
    const routes = {
      init: {
        type: 'session-start' as const,
      },
      doSomething: {
        type: 'transaction' as const,
        handler: () => pass(),
      },
    }
    const result = defineRoutes(routes)
    expect(result).toBe(routes)
  })
})

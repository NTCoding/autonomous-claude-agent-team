import { describe, it, expect } from 'vitest'
import './platform-context.js'
import type { PlatformContext } from './platform-context.js'

describe('PlatformContext', () => {
  it('defines the expected shape', () => {
    const ctx: PlatformContext = {
      getPluginRoot: () => '/plugin',
      now: () => '2024-01-01T00:00:00Z',
      getSessionId: () => 'session-1',
      store: {
        readEvents: () => [],
        appendEvents: () => undefined,
        sessionExists: () => false,
      },
    }
    expect(ctx.getPluginRoot()).toBe('/plugin')
    expect(ctx.getSessionId()).toBe('session-1')
  })
})

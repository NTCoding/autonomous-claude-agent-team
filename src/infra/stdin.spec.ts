import { vi } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'mocked stdin content'),
}))

import { readStdinSync } from './stdin.js'

describe('readStdinSync', () => {
  it('returns content read from stdin', () => {
    expect(readStdinSync()).toStrictEqual('mocked stdin content')
  })
})

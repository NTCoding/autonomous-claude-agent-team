import { describe, it, expect } from 'vitest'
import { EXIT_ALLOW, EXIT_ERROR, EXIT_BLOCK } from './exit-codes.js'

describe('exit-codes', () => {
  it('EXIT_ALLOW is 0', () => {
    expect(EXIT_ALLOW).toBe(0)
  })

  it('EXIT_ERROR is 1', () => {
    expect(EXIT_ERROR).toBe(1)
  })

  it('EXIT_BLOCK is 2', () => {
    expect(EXIT_BLOCK).toBe(2)
  })
})

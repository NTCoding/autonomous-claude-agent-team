import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { arg } from './arg-helpers.js'

describe('arg.number', () => {
  const parser = arg.number('count')

  it('parses a valid integer', () => {
    const result = parser.parse(['cmd', '42'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('returns error for missing argument', () => {
    const result = parser.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: 'cmd: missing required argument <count>' })
  })

  it('returns error for non-numeric value', () => {
    const result = parser.parse(['cmd', 'abc'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: "cmd: not a valid number: 'abc'" })
  })

  it('optional returns undefined for missing argument', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('optional parses a valid value', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd', '5'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 5 })
  })

  it('optional returns error for invalid value', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd', 'xyz'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: "cmd: not a valid number: 'xyz'" })
  })
})

describe('arg.string', () => {
  const parser = arg.string('name')

  it('parses a valid string', () => {
    const result = parser.parse(['cmd', 'hello'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 'hello' })
  })

  it('returns error for missing argument', () => {
    const result = parser.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: 'cmd: missing required argument <name>' })
  })

  it('optional returns undefined for missing argument', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('optional parses a valid value', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd', 'world'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 'world' })
  })
})

describe('arg.state', () => {
  const StateSchema = z.enum(['planning', 'coding', 'review'])
  const parser = arg.state('state', StateSchema)

  it('parses a valid state', () => {
    const result = parser.parse(['cmd', 'planning'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 'planning' })
  })

  it('returns error for missing argument', () => {
    const result = parser.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: 'cmd: missing required argument <state>' })
  })

  it('returns error for invalid state value', () => {
    const result = parser.parse(['cmd', 'unknown'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: "cmd: invalid state 'unknown'" })
  })

  it('optional returns undefined for missing argument', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('optional parses a valid state', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd', 'coding'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: 'coding' })
  })

  it('optional returns error for invalid state', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd', 'bad'], 1, 'cmd')
    expect(result).toEqual({ ok: false, message: "cmd: invalid state 'bad'" })
  })
})

describe('arg.rest', () => {
  const parser = arg.rest('files')

  it('collects all remaining args from position', () => {
    const result = parser.parse(['cmd', 'session-1', 'a.ts', 'b.ts'], 2, 'cmd')
    expect(result).toEqual({ ok: true, value: ['a.ts', 'b.ts'] })
  })

  it('returns empty array when no remaining args', () => {
    const result = parser.parse(['cmd', 'session-1'], 2, 'cmd')
    expect(result).toEqual({ ok: true, value: [] })
  })

  it('optional rest with no args at position returns undefined', () => {
    const optional = parser.optional()
    const result = optional.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: undefined })
  })
})

describe('double optional', () => {
  it('calling optional twice still works', () => {
    const parser = arg.string('name').optional().optional()
    const result = parser.parse(['cmd'], 1, 'cmd')
    expect(result).toEqual({ ok: true, value: undefined })
  })
})

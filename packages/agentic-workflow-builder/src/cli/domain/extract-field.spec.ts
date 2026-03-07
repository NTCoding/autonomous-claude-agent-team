import { describe, it, expect } from 'vitest'
import { extractField } from './extract-field.js'

describe('extractField', () => {
  it('extracts a string field from tool input', () => {
    const extract = extractField('command')
    expect(extract({ command: 'git status' })).toBe('git status')
  })

  it('returns empty string when field is missing', () => {
    const extract = extractField('command')
    expect(extract({})).toBe('')
  })

  it('returns empty string when field is null', () => {
    const extract = extractField('command')
    expect(extract({ command: null })).toBe('')
  })

  it('throws when field is present but not a string', () => {
    const extract = extractField('command')
    expect(() => extract({ command: 42 })).toThrow("Expected 'command' to be a string, got number")
  })
})

import { parseNumber, parseString, parseStringArray } from './arg-parsing.js'

describe('parseNumber', () => {
  it('returns number when given a number', () => {
    expect(parseNumber(42)).toBe(42)
  })

  it('throws ZodError when given a string', () => {
    expect(() => parseNumber('not-a-number')).toThrow('Expected number')
  })

  it('throws ZodError when given undefined', () => {
    expect(() => parseNumber(undefined)).toThrow('Required')
  })

  it('returns zero', () => {
    expect(parseNumber(0)).toBe(0)
  })

  it('returns negative numbers', () => {
    expect(parseNumber(-5)).toBe(-5)
  })
})

describe('parseString', () => {
  it('returns string when given a string', () => {
    expect(parseString('hello')).toBe('hello')
  })

  it('throws ZodError when given a number', () => {
    expect(() => parseString(42)).toThrow('Expected string')
  })

  it('throws ZodError when given undefined', () => {
    expect(() => parseString(undefined)).toThrow('Required')
  })

  it('returns empty string', () => {
    expect(parseString('')).toBe('')
  })
})

describe('parseStringArray', () => {
  it('returns readonly string array when given string array', () => {
    const result = parseStringArray(['a', 'b', 'c'])
    expect(result).toStrictEqual(['a', 'b', 'c'])
  })

  it('returns empty readonly array', () => {
    expect(parseStringArray([])).toStrictEqual([])
  })

  it('throws ZodError when given a string', () => {
    expect(() => parseStringArray('not-array')).toThrow('Expected array')
  })

  it('throws ZodError when array contains non-strings', () => {
    expect(() => parseStringArray([1, 2])).toThrow('Expected string')
  })

  it('throws ZodError when given undefined', () => {
    expect(() => parseStringArray(undefined)).toThrow('Required')
  })
})

import { createEventEntry } from './event-log.js'

describe('createEventEntry', () => {
  it('sets op and at fields', () => {
    const entry = createEventEntry('transition', '2024-01-01T00:00:00.000Z')
    expect(entry.op).toStrictEqual('transition')
    expect(entry.at).toStrictEqual('2024-01-01T00:00:00.000Z')
  })

  it('omits detail field when not provided', () => {
    const entry = createEventEntry('init', '2024-01-01T00:00:00.000Z')
    expect('detail' in entry).toStrictEqual(false)
  })

  it('includes detail field when provided', () => {
    const entry = createEventEntry('record-issue', '2024-01-01T00:00:00.000Z', { issue: 42 })
    expect(entry.detail).toStrictEqual({ issue: 42 })
  })

  it('preserves nested detail values', () => {
    const entry = createEventEntry('transition', '2024-01-01T00:00:00.000Z', { to: 'DEVELOPING', iteration: 1 })
    expect(entry.detail).toStrictEqual({ to: 'DEVELOPING', iteration: 1 })
  })
})

import { BaseEventSchema, type BaseEvent } from './base-event.js'

describe('BaseEventSchema', () => {
  it('validates a valid event', () => {
    const result: BaseEvent = BaseEventSchema.parse({ type: 'session-started', at: '2026-01-01T00:00:00.000Z' })
    expect(result.type).toStrictEqual('session-started')
    expect(result.at).toStrictEqual('2026-01-01T00:00:00.000Z')
  })

  it('rejects missing type field', () => {
    expect(() => BaseEventSchema.parse({ at: '2026-01-01T00:00:00.000Z' })).toThrow('Required')
  })

  it('rejects missing at field', () => {
    expect(() => BaseEventSchema.parse({ type: 'session-started' })).toThrow('Required')
  })
})

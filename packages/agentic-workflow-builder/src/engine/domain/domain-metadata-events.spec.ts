import { DomainMetadataEventSchema } from './domain-metadata-events.js'

describe('DomainMetadataEventSchema', () => {
  it('parses issue-recorded event', () => {
    const result = DomainMetadataEventSchema.parse({
      type: 'issue-recorded',
      at: '2026-01-01T00:00:00Z',
      issueNumber: 42,
    })
    expect(result.type).toBe('issue-recorded')
  })

  it('parses branch-recorded event', () => {
    const result = DomainMetadataEventSchema.parse({
      type: 'branch-recorded',
      at: '2026-01-01T00:00:00Z',
      branch: 'feature/test',
    })
    expect(result.type).toBe('branch-recorded')
  })

  it('parses pr-recorded event', () => {
    const result = DomainMetadataEventSchema.parse({
      type: 'pr-recorded',
      at: '2026-01-01T00:00:00Z',
      prNumber: 99,
    })
    expect(result.type).toBe('pr-recorded')
  })

  it('rejects unknown event type', () => {
    expect(() =>
      DomainMetadataEventSchema.parse({ type: 'unknown', at: '2026-01-01T00:00:00Z' }),
    ).toThrow()
  })
})

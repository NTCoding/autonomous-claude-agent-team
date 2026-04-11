import { hasPassingPrChecks } from './pr-checks-context.js'

describe('hasPassingPrChecks', () => {
  it('returns true when context has prChecksPass true', () => {
    expect(hasPassingPrChecks({ prChecksPass: true })).toStrictEqual(true)
  })

  it('returns false when context has prChecksPass false', () => {
    expect(hasPassingPrChecks({ prChecksPass: false })).toStrictEqual(false)
  })

  it('returns false when context does not match schema', () => {
    expect(hasPassingPrChecks({})).toStrictEqual(false)
  })
})

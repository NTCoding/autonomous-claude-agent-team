import { isTransitionLegal, TRANSITION_MAP } from './transition-map.js'

describe('TRANSITION_MAP', () => {
  it('defines entries for all 11 states', () => {
    const keys = Object.keys(TRANSITION_MAP)
    expect(keys).toHaveLength(11)
  })

  it('SPAWN transitions only to PLANNING', () => {
    expect(TRANSITION_MAP['SPAWN']).toStrictEqual(['PLANNING'])
  })

  it('BLOCKED has no standard targets', () => {
    expect(TRANSITION_MAP['BLOCKED']).toStrictEqual([])
  })
})

describe('isTransitionLegal — BLOCKED special case', () => {
  it('allows any state to transition to BLOCKED', () => {
    const result = isTransitionLegal('DEVELOPING', 'BLOCKED', undefined)
    expect(result.legal).toStrictEqual(true)
  })

  it('allows BLOCKED to return to preBlockedState', () => {
    const result = isTransitionLegal('BLOCKED', 'DEVELOPING', 'DEVELOPING')
    expect(result.legal).toStrictEqual(true)
  })

  it('blocks BLOCKED to non-preBlockedState', () => {
    const result = isTransitionLegal('BLOCKED', 'COMPLETE', 'DEVELOPING')
    expect(result.legal).toStrictEqual(false)
    if (!result.legal) expect(result.reason).toContain('DEVELOPING')
  })

  it('blocks BLOCKED transition when preBlockedState is undefined', () => {
    const result = isTransitionLegal('BLOCKED', 'SPAWN', undefined)
    expect(result.legal).toStrictEqual(false)
    if (!result.legal) expect(result.reason).toContain('unknown')
  })
})

describe('isTransitionLegal — standard transitions', () => {
  it('allows legal transition SPAWN to PLANNING', () => {
    const result = isTransitionLegal('SPAWN', 'PLANNING', undefined)
    expect(result.legal).toStrictEqual(true)
  })

  it('allows legal transition REVIEWING to DEVELOPING (rejection)', () => {
    const result = isTransitionLegal('REVIEWING', 'DEVELOPING', undefined)
    expect(result.legal).toStrictEqual(true)
  })

  it('blocks illegal transition SPAWN to DEVELOPING', () => {
    const result = isTransitionLegal('SPAWN', 'DEVELOPING', undefined)
    expect(result.legal).toStrictEqual(false)
    if (!result.legal) expect(result.reason).toContain('SPAWN')
  })

  it('blocks transition from COMPLETE', () => {
    const result = isTransitionLegal('COMPLETE', 'SPAWN', undefined)
    expect(result.legal).toStrictEqual(false)
    if (!result.legal) expect(result.reason).toContain('none')
  })
})

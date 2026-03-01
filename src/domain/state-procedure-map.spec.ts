import { getProcedurePath } from './state-procedure-map.js'

describe('getProcedurePath', () => {
  it('returns lowercase filename for simple state', () => {
    expect(getProcedurePath('SPAWN', '/plugin')).toStrictEqual('/plugin/states/spawn.md')
  })

  it('replaces underscore with hyphen for CR_REVIEW', () => {
    expect(getProcedurePath('CR_REVIEW', '/plugin')).toStrictEqual('/plugin/states/cr-review.md')
  })

  it('replaces underscore with hyphen for PR_CREATION', () => {
    expect(getProcedurePath('PR_CREATION', '/plugin')).toStrictEqual('/plugin/states/pr-creation.md')
  })

  it('includes pluginRoot as path prefix', () => {
    const result = getProcedurePath('DEVELOPING', '/custom/root')
    expect(result).toContain('/custom/root/states/')
  })
})

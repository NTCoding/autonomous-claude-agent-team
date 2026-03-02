import { pass, fail } from '../index.js'

describe('pass', () => {
  it('returns a passing result', () => {
    expect(pass()).toStrictEqual({ pass: true })
  })
})

describe('fail', () => {
  it('returns a failing result with reason', () => {
    expect(fail('something went wrong')).toStrictEqual({
      pass: false,
      reason: 'something went wrong',
    })
  })
})

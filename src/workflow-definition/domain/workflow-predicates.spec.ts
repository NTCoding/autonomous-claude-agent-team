import { isStateFile } from './workflow-predicates.js'

describe('workflow-predicates', () => {
  it('detects feature-team state files', () => {
    expect(isStateFile('/tmp/feature-team-state-session-1.json')).toStrictEqual(true)
  })

  it('rejects non-state files', () => {
    expect(isStateFile('/tmp/not-state.json')).toStrictEqual(false)
  })
})

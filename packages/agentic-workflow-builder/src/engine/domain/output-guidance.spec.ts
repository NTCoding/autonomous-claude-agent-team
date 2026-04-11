import {
  SEPARATOR,
  formatBlock,
  formatTransitionSuccess,
  formatTransitionError,
  formatIllegalTransitionError,
  formatOperationGateError,
  formatOperationSuccess,
  formatInitSuccess,
} from './output-guidance.js'

const PROCEDURE = '# TEST STATE\n\n## TODO\n\n- [ ] Do something'
const PREFIX = '🟣 SPAWN'

describe('formatBlock', () => {
  it('joins title, separator, and body', () => {
    const result = formatBlock('Title', 'Body text')
    expect(result).toStrictEqual(`Title\n${SEPARATOR}\nBody text`)
  })
})

describe('formatTransitionSuccess — title', () => {
  it('uses provided title', () => {
    expect(formatTransitionSuccess('RESPAWN (iteration: 3)', PROCEDURE, PREFIX)).toContain('RESPAWN (iteration: 3)')
  })

  it('uses plain state name as title', () => {
    expect(formatTransitionSuccess('SPAWN', PROCEDURE, PREFIX)).toContain(`SPAWN\n`)
  })
})

describe('formatTransitionSuccess — procedure content', () => {
  it('includes the procedure content in output', () => {
    const result = formatTransitionSuccess('SPAWN', PROCEDURE, PREFIX)
    expect(result).toContain('Do something')
  })

  it('does not include hardcoded next-steps', () => {
    const result = formatTransitionSuccess('SPAWN', PROCEDURE, PREFIX)
    expect(result).not.toContain('record-issue')
  })
})

describe('formatTransitionError', () => {
  it('includes destination state and reason', () => {
    const result = formatTransitionError('REVIEWING', 'developerDone is false', '', PREFIX)
    expect(result).toContain('REVIEWING')
    expect(result).toContain('developerDone is false')
  })

  it('includes complete the checklist instruction', () => {
    const result = formatTransitionError('REVIEWING', 'reason', '', PREFIX)
    expect(result).toContain('Complete the checklist before transitioning')
  })

  it('includes current state procedure content', () => {
    const result = formatTransitionError('REVIEWING', 'reason', '- [ ] Do something', PREFIX)
    expect(result).toContain('Do something')
  })
})

describe('formatIllegalTransitionError', () => {
  it('includes the reason in output', () => {
    const result = formatIllegalTransitionError('Cannot go SPAWN -> COMPLETE', '', PREFIX)
    expect(result).toContain('Cannot go SPAWN -> COMPLETE')
  })

  it('includes current state procedure content', () => {
    const result = formatIllegalTransitionError('Cannot go SPAWN -> COMPLETE', '- [ ] Do something', PREFIX)
    expect(result).toContain('Do something')
  })
})

describe('formatOperationGateError', () => {
  it('includes operation name and reason', () => {
    const result = formatOperationGateError('signal-done', 'only valid in DEVELOPING', PREFIX)
    expect(result).toContain('signal-done')
    expect(result).toContain('only valid in DEVELOPING')
  })
})

describe('formatOperationSuccess', () => {
  it('includes operation name as title and body content', () => {
    const result = formatOperationSuccess('record-issue', 'GitHub issue #42 recorded.', PREFIX)
    expect(result).toContain('record-issue')
    expect(result).toContain('#42')
  })
})

describe('formatInitSuccess', () => {
  it('includes procedure content', () => {
    const result = formatInitSuccess(PROCEDURE, PREFIX)
    expect(result).toContain('Do something')
  })

  it('includes Feature team initialized title', () => {
    const result = formatInitSuccess(PROCEDURE, PREFIX)
    expect(result).toContain('Feature team initialized')
  })
})

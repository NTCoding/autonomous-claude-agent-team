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
import { INITIAL_STATE } from './workflow-state.js'
import type { WorkflowState } from './workflow-state.js'

const PROCEDURE = '# TEST STATE\n\n## TODO\n\n- [ ] Do something'

describe('formatBlock', () => {
  it('joins title, separator, and body', () => {
    const result = formatBlock('Title', 'Body text')
    expect(result).toStrictEqual(`Title\n${SEPARATOR}\nBody text`)
  })
})

describe('formatTransitionSuccess — title', () => {
  it('includes iteration count for RESPAWN', () => {
    const state: WorkflowState = { ...INITIAL_STATE, iteration: 3 }
    expect(formatTransitionSuccess('RESPAWN', state, PROCEDURE)).toContain('RESPAWN (iteration: 3)')
  })

  it('includes iteration count for DEVELOPING', () => {
    const state: WorkflowState = { ...INITIAL_STATE, iteration: 2 }
    expect(formatTransitionSuccess('DEVELOPING', state, PROCEDURE)).toContain(
      'DEVELOPING (iteration: 2)',
    )
  })

  it('uses plain state name for other states', () => {
    expect(formatTransitionSuccess('SPAWN', INITIAL_STATE, PROCEDURE)).toContain(`SPAWN\n`)
  })
})

describe('formatTransitionSuccess — procedure content', () => {
  it('includes the procedure content in output', () => {
    const result = formatTransitionSuccess('SPAWN', INITIAL_STATE, PROCEDURE)
    expect(result).toContain('Do something')
  })

  it('does not include hardcoded next-steps', () => {
    const result = formatTransitionSuccess('SPAWN', INITIAL_STATE, PROCEDURE)
    expect(result).not.toContain('record-issue')
  })
})

describe('formatTransitionError', () => {
  it('includes destination state and reason', () => {
    const result = formatTransitionError('REVIEWING', 'developerDone is false')
    expect(result).toContain('REVIEWING')
    expect(result).toContain('developerDone is false')
  })

  it('includes complete the checklist instruction', () => {
    const result = formatTransitionError('REVIEWING', 'reason')
    expect(result).toContain('Complete the checklist before transitioning')
  })

  it('does not include procedure content', () => {
    const result = formatTransitionError('REVIEWING', 'reason')
    expect(result).not.toContain('Do something')
  })
})

describe('formatIllegalTransitionError', () => {
  it('includes the reason in output', () => {
    const result = formatIllegalTransitionError('Cannot go SPAWN -> COMPLETE')
    expect(result).toContain('Cannot go SPAWN -> COMPLETE')
  })

  it('does not include procedure content', () => {
    const result = formatIllegalTransitionError('Cannot go SPAWN -> COMPLETE')
    expect(result).not.toContain('Do something')
  })
})

describe('formatOperationGateError', () => {
  it('includes operation name and reason', () => {
    const result = formatOperationGateError('signal-done', 'only valid in DEVELOPING')
    expect(result).toContain('signal-done')
    expect(result).toContain('only valid in DEVELOPING')
  })
})

describe('formatOperationSuccess — record-issue', () => {
  it('includes issue number when githubIssue is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, githubIssue: 42 }
    expect(formatOperationSuccess('record-issue', state)).toContain('#42')
  })

  it('shows fallback when githubIssue is absent', () => {
    expect(formatOperationSuccess('record-issue', INITIAL_STATE)).toContain('#?')
  })
})

describe('formatOperationSuccess — record-branch', () => {
  it('includes branch name when featureBranch is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, featureBranch: 'feat/add-pdf' }
    expect(formatOperationSuccess('record-branch', state)).toContain('feat/add-pdf')
  })

  it('shows fallback when featureBranch is absent', () => {
    expect(formatOperationSuccess('record-branch', INITIAL_STATE)).toContain("'?'")
  })
})

describe('formatOperationSuccess — record-plan-approval', () => {
  it('includes transition RESPAWN command', () => {
    expect(formatOperationSuccess('record-plan-approval', INITIAL_STATE)).toContain(
      'transition RESPAWN',
    )
  })
})

describe('formatOperationSuccess — assign-iteration-task', () => {
  it('includes task when currentIterationTask is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, currentIterationTask: 'Iteration 1' }
    expect(formatOperationSuccess('assign-iteration-task', state)).toContain(
      'Iteration 1',
    )
  })

  it('shows fallback when currentIterationTask is absent', () => {
    expect(formatOperationSuccess('assign-iteration-task', INITIAL_STATE)).toContain(
      "'?'",
    )
  })
})

describe('formatOperationSuccess — signal-done', () => {
  it('includes transition REVIEWING command', () => {
    expect(formatOperationSuccess('signal-done', INITIAL_STATE)).toContain(
      'transition REVIEWING',
    )
  })
})

describe('formatOperationSuccess — record-pr', () => {
  it('includes PR number when prNumber is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, prNumber: 17 }
    expect(formatOperationSuccess('record-pr', state)).toContain('#17')
  })

  it('shows fallback when prNumber is absent', () => {
    expect(formatOperationSuccess('record-pr', INITIAL_STATE)).toContain('#?')
  })
})

describe('formatOperationSuccess — create-pr', () => {
  it('includes PR number when prNumber is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, prNumber: 42 }
    expect(formatOperationSuccess('create-pr', state)).toContain('#42')
  })

  it('shows fallback when prNumber is absent', () => {
    expect(formatOperationSuccess('create-pr', INITIAL_STATE)).toContain('#?')
  })

  it('includes transition FEEDBACK command', () => {
    expect(formatOperationSuccess('create-pr', INITIAL_STATE)).toContain(
      'transition FEEDBACK',
    )
  })
})

describe('formatOperationSuccess — append-issue-checklist', () => {
  it('includes issue number when githubIssue is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, githubIssue: 10 }
    expect(formatOperationSuccess('append-issue-checklist', state)).toContain('#10')
  })
})

describe('formatOperationSuccess — tick-iteration', () => {
  it('includes issue number when githubIssue is set', () => {
    const state: WorkflowState = { ...INITIAL_STATE, githubIssue: 10 }
    expect(formatOperationSuccess('tick-iteration', state)).toContain('#10')
  })
})

describe('formatInitSuccess', () => {
  it('includes procedure content', () => {
    const result = formatInitSuccess(PROCEDURE)
    expect(result).toContain('Do something')
  })

  it('includes Feature team initialized title', () => {
    const result = formatInitSuccess(PROCEDURE)
    expect(result).toContain('Feature team initialized')
  })
})

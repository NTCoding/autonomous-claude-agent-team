import { checkOperationGate } from './operation-gates.js'

describe('checkOperationGate — passes in correct state', () => {
  it('allows signal-done in DEVELOPING', () => {
    expect(checkOperationGate('signal-done', 'DEVELOPING').pass).toStrictEqual(true)
  })

  it('allows record-issue in SPAWN', () => {
    expect(checkOperationGate('record-issue', 'SPAWN').pass).toStrictEqual(true)
  })

  it('allows record-branch in PLANNING', () => {
    expect(checkOperationGate('record-branch', 'PLANNING').pass).toStrictEqual(true)
  })

  it('allows record-plan-approval in PLANNING', () => {
    expect(checkOperationGate('record-plan-approval', 'PLANNING').pass).toStrictEqual(true)
  })

  it('allows assign-iteration-task in RESPAWN', () => {
    expect(checkOperationGate('assign-iteration-task', 'RESPAWN').pass).toStrictEqual(true)
  })

  it('allows record-pr in PR_CREATION', () => {
    expect(checkOperationGate('record-pr', 'PR_CREATION').pass).toStrictEqual(true)
  })

  it('allows create-pr in PR_CREATION', () => {
    expect(checkOperationGate('create-pr', 'PR_CREATION').pass).toStrictEqual(true)
  })

  it('allows append-issue-checklist in PLANNING', () => {
    expect(checkOperationGate('append-issue-checklist', 'PLANNING').pass).toStrictEqual(true)
  })

  it('allows tick-iteration in COMMITTING', () => {
    expect(checkOperationGate('tick-iteration', 'COMMITTING').pass).toStrictEqual(true)
  })
})

describe('checkOperationGate — fails in wrong state', () => {
  it('blocks signal-done in REVIEWING', () => {
    const result = checkOperationGate('signal-done', 'REVIEWING')
    expect(result.pass).toStrictEqual(false)
  })

  it('blocks create-pr in DEVELOPING', () => {
    const result = checkOperationGate('create-pr', 'DEVELOPING')
    expect(result.pass).toStrictEqual(false)
  })

  it('blocks append-issue-checklist in DEVELOPING', () => {
    const result = checkOperationGate('append-issue-checklist', 'DEVELOPING')
    expect(result.pass).toStrictEqual(false)
  })

  it('blocks tick-iteration in DEVELOPING', () => {
    const result = checkOperationGate('tick-iteration', 'DEVELOPING')
    expect(result.pass).toStrictEqual(false)
  })

  it('failure reason includes operation name', () => {
    const result = checkOperationGate('record-issue', 'DEVELOPING')
    if (!result.pass) expect(result.reason).toContain('record-issue')
  })

  it('failure reason includes current state', () => {
    const result = checkOperationGate('signal-done', 'REVIEWING')
    if (!result.pass) expect(result.reason).toContain('REVIEWING')
  })

  it('failure reason lists allowed states', () => {
    const result = checkOperationGate('signal-done', 'REVIEWING')
    if (!result.pass) expect(result.reason).toContain('DEVELOPING')
  })
})

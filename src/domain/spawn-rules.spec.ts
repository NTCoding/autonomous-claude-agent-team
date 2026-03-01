import { checkSpawnAllowed } from './spawn-rules.js'
import type { WorkflowState } from './workflow-state.js'
import { INITIAL_STATE } from './workflow-state.js'

const RESPAWN_STATE: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN', githubIssue: 42 }
const DEVELOPING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'DEVELOPING', githubIssue: 42 }
const SPAWN_STATE: WorkflowState = { ...INITIAL_STATE, state: 'SPAWN' }
const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING', githubIssue: 42 }

describe('checkSpawnAllowed — lead agents', () => {
  it('allows lead by name in any state', () => {
    const result = checkSpawnAllowed('lead-1', '', SPAWN_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows lead by agent type in any state', () => {
    const result = checkSpawnAllowed('anything', 'feature-team-lead', SPAWN_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows lead in COMPLETE state', () => {
    const completeState: WorkflowState = { ...INITIAL_STATE, state: 'COMPLETE' }
    const result = checkSpawnAllowed('lead-1', '', completeState)
    expect(result).toStrictEqual({ allow: true })
  })
})

describe('checkSpawnAllowed — agent name validation', () => {
  it('blocks agents with empty name', () => {
    const result = checkSpawnAllowed('', '', RESPAWN_STATE)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('{role}-{iteration}')
    }
  })

  it('blocks agents with invalid name format', () => {
    const result = checkSpawnAllowed('alice', '', RESPAWN_STATE)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain("'alice'")
      expect(result.reason).toContain('{role}-{iteration}')
    }
  })

  it('blocks agents with name missing iteration number', () => {
    const result = checkSpawnAllowed('developer-', '', RESPAWN_STATE)
    expect(result.allow).toBe(false)
  })

  it('blocks agents with unrecognized role prefix', () => {
    const result = checkSpawnAllowed('tester-1', '', RESPAWN_STATE)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain("'tester-1'")
    }
  })
})

describe('checkSpawnAllowed — duplicate role blocking', () => {
  it('blocks developer spawn when another developer is active', () => {
    const stateWithDeveloper: WorkflowState = {
      ...DEVELOPING_STATE,
      activeAgents: ['developer-1'],
    }
    const result = checkSpawnAllowed('developer-2', '', stateWithDeveloper)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('developer')
      expect(result.reason).toContain('already active')
    }
  })

  it('blocks reviewer spawn when another reviewer is active', () => {
    const stateWithReviewer: WorkflowState = {
      ...DEVELOPING_STATE,
      activeAgents: ['reviewer-1'],
    }
    const result = checkSpawnAllowed('reviewer-2', '', stateWithReviewer)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('reviewer')
      expect(result.reason).toContain('already active')
    }
  })

  it('allows developer when no other developer is active', () => {
    const stateWithReviewer: WorkflowState = {
      ...RESPAWN_STATE,
      activeAgents: ['reviewer-1'],
    }
    const result = checkSpawnAllowed('developer-1', '', stateWithReviewer)
    expect(result).toStrictEqual({ allow: true })
  })

  it('does not count the agent itself as a duplicate', () => {
    const stateWithSameAgent: WorkflowState = {
      ...RESPAWN_STATE,
      activeAgents: ['developer-1'],
    }
    const result = checkSpawnAllowed('developer-1', '', stateWithSameAgent)
    expect(result).toStrictEqual({ allow: true })
  })
})

describe('checkSpawnAllowed — state-based blocking', () => {
  it('allows developer in RESPAWN', () => {
    const result = checkSpawnAllowed('developer-1', '', RESPAWN_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows developer in DEVELOPING', () => {
    const result = checkSpawnAllowed('developer-1', '', DEVELOPING_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows reviewer in RESPAWN', () => {
    const result = checkSpawnAllowed('reviewer-1', '', RESPAWN_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows reviewer in DEVELOPING', () => {
    const result = checkSpawnAllowed('reviewer-1', '', DEVELOPING_STATE)
    expect(result).toStrictEqual({ allow: true })
  })

  it('allows developer in SPAWN when githubIssue is set', () => {
    const stateWithIssue: WorkflowState = { ...SPAWN_STATE, githubIssue: 42 }
    const result = checkSpawnAllowed('developer-1', '', stateWithIssue)
    expect(result).toStrictEqual({ allow: true })
  })

  it('blocks developer in PLANNING', () => {
    const result = checkSpawnAllowed('developer-1', '', PLANNING_STATE)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('PLANNING')
    }
  })

  it('blocks reviewer in COMMITTING', () => {
    const committingState: WorkflowState = { ...INITIAL_STATE, state: 'COMMITTING', githubIssue: 42 }
    const result = checkSpawnAllowed('reviewer-1', '', committingState)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('COMMITTING')
    }
  })

  it('blocks developer in COMPLETE', () => {
    const completeState: WorkflowState = { ...INITIAL_STATE, state: 'COMPLETE', githubIssue: 42 }
    const result = checkSpawnAllowed('developer-1', '', completeState)
    expect(result.allow).toBe(false)
  })

  it('blocks reviewer in PR_CREATION', () => {
    const prState: WorkflowState = { ...INITIAL_STATE, state: 'PR_CREATION', githubIssue: 42 }
    const result = checkSpawnAllowed('reviewer-1', '', prState)
    expect(result.allow).toBe(false)
  })
})

describe('checkSpawnAllowed — github issue requirement', () => {
  it('blocks developer when githubIssue is not set', () => {
    const stateNoIssue: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN' }
    const result = checkSpawnAllowed('developer-1', '', stateNoIssue)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('GitHub issue')
      expect(result.reason).toContain('record-issue')
    }
  })

  it('blocks reviewer when githubIssue is not set', () => {
    const stateNoIssue: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN' }
    const result = checkSpawnAllowed('reviewer-1', '', stateNoIssue)
    expect(result.allow).toBe(false)
    if (!result.allow) {
      expect(result.reason).toContain('GitHub issue')
    }
  })

  it('allows developer when githubIssue is set', () => {
    const result = checkSpawnAllowed('developer-1', '', RESPAWN_STATE)
    expect(result).toStrictEqual({ allow: true })
  })
})

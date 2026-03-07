import { checkBashCommand } from '@ntcoding/agentic-workflow-builder/dsl'
import { checkWriteAllowed } from './workflow-predicates.js'
import { BASH_FORBIDDEN, WORKFLOW_REGISTRY } from './registry.js'
import type { WorkflowState, StateName } from './workflow-types.js'
import { EMPTY_STATE } from './fold.js'

function stateInPhase(phase: StateName): WorkflowState {
  return { ...EMPTY_STATE, currentStateMachineState: phase }
}

function bashCheck(command: string, stateName: StateName) {
  const exemptions = WORKFLOW_REGISTRY[stateName].allowForbidden?.bash ?? []
  return checkBashCommand(command, BASH_FORBIDDEN, exemptions)
}

describe('checkWriteAllowed predicate', () => {
  it('allows non-write tools', () => {
    const result = checkWriteAllowed('Read', '/some/file.ts', stateInPhase('RESPAWN'))
    expect(result).toStrictEqual({ pass: true })
  })

  it('allows state file writes', () => {
    const result = checkWriteAllowed('Write', '/tmp/feature-team-state-abc.json', stateInPhase('RESPAWN'))
    expect(result).toStrictEqual({ pass: true })
  })

  it('blocks Write tool with reason containing state name', () => {
    const result = checkWriteAllowed('Write', '/some/file.ts', stateInPhase('RESPAWN'))
    expect(result.pass).toBe(false)
    if (!result.pass) {
      expect(result.reason).toBe("Write operation 'Write' is forbidden in state: RESPAWN")
    }
  })

  it('blocks Edit tool', () => {
    const result = checkWriteAllowed('Edit', '/some/file.ts', stateInPhase('RESPAWN'))
    expect(result.pass).toBe(false)
  })

  it('blocks NotebookEdit tool', () => {
    const result = checkWriteAllowed('NotebookEdit', '/some/file.ts', stateInPhase('RESPAWN'))
    expect(result.pass).toBe(false)
  })
})

describe('registry forbidden.write', () => {
  it('RESPAWN has write forbidden', () => {
    expect(WORKFLOW_REGISTRY.RESPAWN.forbidden?.write).toBe(true)
  })

  it('DEVELOPING does not have write forbidden', () => {
    expect(WORKFLOW_REGISTRY.DEVELOPING.forbidden?.write).toBeUndefined()
  })
})

describe('bash enforcement via BASH_FORBIDDEN + registry exemptions', () => {
  it('blocks git commit in DEVELOPING (no exemptions)', () => {
    const result = bashCheck('git commit -m "test"', 'DEVELOPING')
    expect(result.pass).toBe(false)
  })

  it('blocks git push in REVIEWING (no exemptions)', () => {
    const result = bashCheck('git push origin main', 'REVIEWING')
    expect(result.pass).toBe(false)
  })

  it('blocks git commit in RESPAWN', () => {
    const result = bashCheck('git commit -m "test"', 'RESPAWN')
    expect(result.pass).toBe(false)
  })

  it('blocks git commit in SPAWN', () => {
    const result = bashCheck('git commit -m "test"', 'SPAWN')
    expect(result.pass).toBe(false)
  })

  it('blocks git checkout in DEVELOPING', () => {
    const result = bashCheck('git checkout main', 'DEVELOPING')
    expect(result.pass).toBe(false)
  })

  it('allows non-git commands in DEVELOPING', () => {
    const result = bashCheck('npm test', 'DEVELOPING')
    expect(result).toStrictEqual({ pass: true })
  })

  it('allows git commit in COMMITTING (exempt via allowForbidden)', () => {
    const result = bashCheck('git commit -m "test"', 'COMMITTING')
    expect(result).toStrictEqual({ pass: true })
  })

  it('allows git push in COMMITTING (exempt via allowForbidden)', () => {
    const result = bashCheck('git push origin main', 'COMMITTING')
    expect(result).toStrictEqual({ pass: true })
  })

  it('allows git checkout in PLANNING (exempt via allowForbidden)', () => {
    const result = bashCheck('git checkout -b feature', 'PLANNING')
    expect(result).toStrictEqual({ pass: true })
  })

  it('COMMITTING registry has git commit and git push exemptions', () => {
    expect(WORKFLOW_REGISTRY.COMMITTING.allowForbidden?.bash).toContain('git commit')
    expect(WORKFLOW_REGISTRY.COMMITTING.allowForbidden?.bash).toContain('git push')
  })

  it('PLANNING registry has git checkout exemption', () => {
    expect(WORKFLOW_REGISTRY.PLANNING.allowForbidden?.bash).toContain('git checkout')
  })
})

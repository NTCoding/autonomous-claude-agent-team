import { checkOperationGate, defineRecordingOps } from './recording-ops.js'
import type { WorkflowRegistry, WorkflowStateDefinition } from './types.js'

type TestState = {
  readonly currentStateMachineState: TestStateName
  readonly data: string
}

type TestStateName = 'idle' | 'working'
type TestOperation = 'record-issue' | 'record-branch'

const idleState: WorkflowStateDefinition<TestState, TestStateName, TestOperation> = {
  emoji: '🟡',
  agentInstructions: 'idle instructions',
  canTransitionTo: ['working'],
  allowedWorkflowOperations: ['record-issue', 'record-branch'],
}

const workingState: WorkflowStateDefinition<TestState, TestStateName, TestOperation> = {
  emoji: '🟢',
  agentInstructions: 'working instructions',
  canTransitionTo: ['idle'],
  allowedWorkflowOperations: [],
}

const registry: WorkflowRegistry<TestState, TestStateName, TestOperation> = {
  idle: idleState,
  working: workingState,
}

describe('checkOperationGate', () => {
  it('returns pass when operation is in allowedWorkflowOperations', () => {
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const result = checkOperationGate('record-issue', state, registry)
    expect(result).toStrictEqual({ pass: true })
  })

  it('returns fail with message when operation is not allowed', () => {
    const state: TestState = { currentStateMachineState: 'working' as const, data: 'test' }
    const result = checkOperationGate('record-issue', state, registry)
    expect(result).toStrictEqual({
      pass: false,
      reason: 'record-issue is not allowed in state working.',
    })
  })

})

describe('defineRecordingOps', () => {
  const ops = defineRecordingOps(registry, {
    'record-issue': {
      event: 'issue-recorded',
      payload: (issueNumber: number) => ({ issueNumber }),
    },
    'record-branch': {
      event: 'branch-recorded',
      payload: (branch: string) => ({ branch }),
    },
  })

  it('returns pass with correct event when gate check passes', () => {
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const result = ops.executeOp('record-issue', state, '2026-03-07T00:00:00Z', [42])
    expect(result).toStrictEqual({
      pass: true,
      event: { type: 'issue-recorded', at: '2026-03-07T00:00:00Z', issueNumber: 42 },
    })
  })

  it('returns fail when gate check blocks (wrong state)', () => {
    const state: TestState = { currentStateMachineState: 'working' as const, data: 'test' }
    const result = ops.executeOp('record-issue', state, '2026-03-07T00:00:00Z', [42])
    expect(result).toStrictEqual({
      pass: false,
      reason: 'record-issue is not allowed in state working.',
    })
  })

  it('returns fail for unknown recording operation', () => {
    type OpenState = { readonly currentStateMachineState: 'open'; readonly data: string }
    const permissiveRegistry: WorkflowRegistry<OpenState, 'open', 'do-something'> = {
      open: {
        emoji: '🔓',
        agentInstructions: '',
        canTransitionTo: [],
        allowedWorkflowOperations: ['do-something'],
      },
    }
    const permissiveOps = defineRecordingOps(permissiveRegistry, {})
    const state: OpenState = { currentStateMachineState: 'open' as const, data: 'test' }
    const result = permissiveOps.executeOp('do-something', state, '2026-03-07T00:00:00Z', [])
    expect(result).toStrictEqual({
      pass: false,
      reason: 'Unknown recording operation: do-something',
    })
  })

  it('correctly calls payload function with provided args', () => {
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const result = ops.executeOp('record-branch', state, '2026-03-07T00:00:00Z', ['feature/test'])
    expect(result).toStrictEqual({
      pass: true,
      event: { type: 'branch-recorded', at: '2026-03-07T00:00:00Z', branch: 'feature/test' },
    })
  })

  it('event includes type, at, and all payload fields', () => {
    const multiFieldOps = defineRecordingOps(registry, {
      'record-issue': {
        event: 'issue-recorded',
        payload: (issueNumber: number, label: string) => ({ issueNumber, label }),
      },
    })
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const result = multiFieldOps.executeOp('record-issue', state, '2026-03-07T00:00:00Z', [99, 'bug'])
    expect(result).toStrictEqual({
      pass: true,
      event: {
        type: 'issue-recorded',
        at: '2026-03-07T00:00:00Z',
        issueNumber: 99,
        label: 'bug',
      },
    })
  })

  it('works with multiple operations defined', () => {
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const issueResult = ops.executeOp('record-issue', state, '2026-03-07T00:00:00Z', [1])
    const branchResult = ops.executeOp('record-branch', state, '2026-03-07T00:00:00Z', ['main'])
    expect(issueResult).toStrictEqual({
      pass: true,
      event: { type: 'issue-recorded', at: '2026-03-07T00:00:00Z', issueNumber: 1 },
    })
    expect(branchResult).toStrictEqual({
      pass: true,
      event: { type: 'branch-recorded', at: '2026-03-07T00:00:00Z', branch: 'main' },
    })
  })

  it('works with zero-arg operations (no payload args)', () => {
    const zeroArgOps = defineRecordingOps(registry, {
      'record-issue': {
        event: 'issue-acknowledged',
        payload: () => ({}),
      },
    })
    const state: TestState = { currentStateMachineState: 'idle' as const, data: 'test' }
    const result = zeroArgOps.executeOp('record-issue', state, '2026-03-07T00:00:00Z', [])
    expect(result).toStrictEqual({
      pass: true,
      event: { type: 'issue-acknowledged', at: '2026-03-07T00:00:00Z' },
    })
  })
})

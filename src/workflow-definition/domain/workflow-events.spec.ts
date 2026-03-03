import { WorkflowEventSchema, type WorkflowEvent } from './workflow-events.js'

const AT = '2026-01-01T00:00:00.000Z'

describe('WorkflowEventSchema — session-started', () => {
  it('accepts valid payload', () => {
    const result: WorkflowEvent = WorkflowEventSchema.parse({ type: 'session-started', at: AT, sessionId: 'abc123' })
    expect(result.type).toStrictEqual('session-started')
  })

  it('accepts optional transcriptPath', () => {
    const result = WorkflowEventSchema.parse({ type: 'session-started', at: AT, sessionId: 'abc123', transcriptPath: '/tmp/t.json' })
    expect(result.type).toStrictEqual('session-started')
  })

  it('rejects missing sessionId', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'session-started', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — issue-recorded', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'issue-recorded', at: AT, issueNumber: 42 })
    expect(result.type).toStrictEqual('issue-recorded')
  })

  it('rejects missing issueNumber', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'issue-recorded', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — branch-recorded', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'branch-recorded', at: AT, branch: 'feature/foo' })
    expect(result.type).toStrictEqual('branch-recorded')
  })

  it('rejects missing branch', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'branch-recorded', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — plan-approval-recorded', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'plan-approval-recorded', at: AT })
    expect(result.type).toStrictEqual('plan-approval-recorded')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'plan-approval-recorded' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — iteration-task-assigned', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'iteration-task-assigned', at: AT, task: 'Build login' })
    expect(result.type).toStrictEqual('iteration-task-assigned')
  })

  it('rejects missing task', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'iteration-task-assigned', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — developer-done-signaled', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'developer-done-signaled', at: AT })
    expect(result.type).toStrictEqual('developer-done-signaled')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'developer-done-signaled' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — pr-recorded', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'pr-recorded', at: AT, prNumber: 7 })
    expect(result.type).toStrictEqual('pr-recorded')
  })

  it('rejects missing prNumber', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'pr-recorded', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — pr-created', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'pr-created', at: AT, prNumber: 8 })
    expect(result.type).toStrictEqual('pr-created')
  })

  it('rejects missing prNumber', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'pr-created', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — issue-checklist-appended', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'issue-checklist-appended', at: AT, issueNumber: 10 })
    expect(result.type).toStrictEqual('issue-checklist-appended')
  })

  it('rejects missing issueNumber', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'issue-checklist-appended', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — iteration-ticked', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'iteration-ticked', at: AT, issueNumber: 11 })
    expect(result.type).toStrictEqual('iteration-ticked')
  })

  it('rejects missing issueNumber', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'iteration-ticked', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — review-approved', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'review-approved', at: AT })
    expect(result.type).toStrictEqual('review-approved')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'review-approved' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — review-rejected', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'review-rejected', at: AT })
    expect(result.type).toStrictEqual('review-rejected')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'review-rejected' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — coderabbit-addressed', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'coderabbit-addressed', at: AT })
    expect(result.type).toStrictEqual('coderabbit-addressed')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'coderabbit-addressed' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — coderabbit-ignored', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'coderabbit-ignored', at: AT })
    expect(result.type).toStrictEqual('coderabbit-ignored')
  })

  it('rejects missing at', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'coderabbit-ignored' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — lint-ran', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'lint-ran', at: AT, files: 5, passed: true })
    expect(result.type).toStrictEqual('lint-ran')
  })

  it('accepts optional lintedFiles', () => {
    const result = WorkflowEventSchema.parse({ type: 'lint-ran', at: AT, files: 3, passed: false, lintedFiles: ['a.ts'] })
    expect(result.type).toStrictEqual('lint-ran')
  })

  it('rejects missing files', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'lint-ran', at: AT, passed: true })).toThrow('Required')
  })

  it('rejects missing passed', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'lint-ran', at: AT, files: 5 })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — agent-registered', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'agent-registered', at: AT, agentType: 'developer', agentId: 'dev-1' })
    expect(result.type).toStrictEqual('agent-registered')
  })

  it('rejects missing agentType', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'agent-registered', at: AT, agentId: 'dev-1' })).toThrow('Required')
  })

  it('rejects missing agentId', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'agent-registered', at: AT, agentType: 'developer' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — agent-shut-down', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'agent-shut-down', at: AT, agentName: 'dev-1' })
    expect(result.type).toStrictEqual('agent-shut-down')
  })

  it('rejects missing agentName', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'agent-shut-down', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — transitioned', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'transitioned', at: AT, from: 'SPAWN', to: 'PLANNING' })
    expect(result.type).toStrictEqual('transitioned')
  })

  it('accepts all optional fields', () => {
    const result = WorkflowEventSchema.parse({
      type: 'transitioned', at: AT, from: 'DEVELOPING', to: 'BLOCKED',
      preBlockedState: 'DEVELOPING', iteration: 1, developingHeadCommit: 'abc', developerDone: true,
    })
    expect(result.type).toStrictEqual('transitioned')
  })

  it('rejects missing from', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'transitioned', at: AT, to: 'PLANNING' })).toThrow('Required')
  })

  it('rejects missing to', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'transitioned', at: AT, from: 'SPAWN' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — idle-checked', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'idle-checked', at: AT, agentName: 'dev-1', allowed: true })
    expect(result.type).toStrictEqual('idle-checked')
  })

  it('accepts optional reason', () => {
    const result = WorkflowEventSchema.parse({ type: 'idle-checked', at: AT, agentName: 'dev-1', allowed: false, reason: 'not allowed' })
    expect(result.type).toStrictEqual('idle-checked')
  })

  it('rejects missing agentName', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'idle-checked', at: AT, allowed: true })).toThrow('Required')
  })

  it('rejects missing allowed', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'idle-checked', at: AT, agentName: 'dev-1' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — write-checked', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'write-checked', at: AT, tool: 'Write', filePath: '/tmp/x.ts', allowed: true })
    expect(result.type).toStrictEqual('write-checked')
  })

  it('accepts optional reason', () => {
    const result = WorkflowEventSchema.parse({ type: 'write-checked', at: AT, tool: 'Write', filePath: '/tmp/x.ts', allowed: false, reason: 'blocked' })
    expect(result.type).toStrictEqual('write-checked')
  })

  it('rejects missing tool', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'write-checked', at: AT, filePath: '/tmp/x.ts', allowed: true })).toThrow('Required')
  })

  it('rejects missing filePath', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'write-checked', at: AT, tool: 'Write', allowed: true })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — bash-checked', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'bash-checked', at: AT, tool: 'Bash', command: 'pnpm test', allowed: true })
    expect(result.type).toStrictEqual('bash-checked')
  })

  it('accepts optional reason', () => {
    const result = WorkflowEventSchema.parse({ type: 'bash-checked', at: AT, tool: 'Bash', command: 'git push', allowed: false, reason: 'forbidden' })
    expect(result.type).toStrictEqual('bash-checked')
  })

  it('rejects missing command', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'bash-checked', at: AT, tool: 'Bash', allowed: true })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — plugin-read-checked', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'plugin-read-checked', at: AT, tool: 'Read', path: '/tmp/x', allowed: true })
    expect(result.type).toStrictEqual('plugin-read-checked')
  })

  it('accepts optional reason', () => {
    const result = WorkflowEventSchema.parse({ type: 'plugin-read-checked', at: AT, tool: 'Read', path: '/tmp/x', allowed: false, reason: 'denied' })
    expect(result.type).toStrictEqual('plugin-read-checked')
  })

  it('rejects missing path', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'plugin-read-checked', at: AT, tool: 'Read', allowed: true })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — identity-verified', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'identity-verified', at: AT, status: 'ok', transcriptPath: '/tmp/t.json' })
    expect(result.type).toStrictEqual('identity-verified')
  })

  it('rejects missing status', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'identity-verified', at: AT, transcriptPath: '/tmp/t.json' })).toThrow('Required')
  })

  it('rejects missing transcriptPath', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'identity-verified', at: AT, status: 'ok' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — context-requested', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'context-requested', at: AT, agentName: 'dev-1' })
    expect(result.type).toStrictEqual('context-requested')
  })

  it('rejects missing agentName', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'context-requested', at: AT })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — journal-entry', () => {
  it('accepts valid payload', () => {
    const result = WorkflowEventSchema.parse({ type: 'journal-entry', at: AT, agentName: 'dev-1', content: 'Started work' })
    expect(result.type).toStrictEqual('journal-entry')
  })

  it('rejects missing agentName', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'journal-entry', at: AT, content: 'Started work' })).toThrow('Required')
  })

  it('rejects missing content', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'journal-entry', at: AT, agentName: 'dev-1' })).toThrow('Required')
  })
})

describe('WorkflowEventSchema — discriminant validation', () => {
  it('rejects unknown type discriminant', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'unknown-event', at: AT })).toThrow('Invalid discriminator value')
  })

  it('rejects missing type field', () => {
    expect(() => WorkflowEventSchema.parse({ at: AT })).toThrow('Invalid discriminator value')
  })

  it('rejects missing at when type is present', () => {
    expect(() => WorkflowEventSchema.parse({ type: 'session-started', sessionId: 'x' })).toThrow('Required')
  })

  it('rejects missing type field with only extra fields', () => {
    expect(() => WorkflowEventSchema.parse({ at: AT, sessionId: 'x' })).toThrow('Invalid discriminator value')
  })
})

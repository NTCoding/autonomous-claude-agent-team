import { describe, it, expect } from 'vitest'
import { EngineEventSchema } from './engine-events.js'

describe('EngineEventSchema', () => {
  it('parses session-started event', () => {
    const result = EngineEventSchema.parse({
      type: 'session-started',
      at: '2026-01-01T00:00:00Z',
      repository: 'test/repo',
      currentState: 'SPAWN',
      states: ['SPAWN', 'PLANNING'],
    })
    expect(result.type).toBe('session-started')
    if (result.type === 'session-started') {
      expect(result.repository).toBe('test/repo')
      expect(result.currentState).toBe('SPAWN')
      expect(result.states).toEqual(['SPAWN', 'PLANNING'])
    }
  })

  it('parses transitioned event', () => {
    const result = EngineEventSchema.parse({
      type: 'transitioned',
      at: '2026-01-01T00:00:00Z',
      from: 'SPAWN',
      to: 'PLANNING',
    })
    expect(result.type).toBe('transitioned')
    if (result.type === 'transitioned') {
      expect(result.from).toBe('SPAWN')
      expect(result.to).toBe('PLANNING')
    }
  })

  it('parses agent-registered event', () => {
    const result = EngineEventSchema.parse({
      type: 'agent-registered',
      at: '2026-01-01T00:00:00Z',
      agentType: 'lead',
      agentId: 'lead-1',
    })
    expect(result.type).toBe('agent-registered')
  })

  it('parses journal-entry event', () => {
    const result = EngineEventSchema.parse({
      type: 'journal-entry',
      at: '2026-01-01T00:00:00Z',
      agentName: 'dev-1',
      content: 'Working on feature',
    })
    expect(result.type).toBe('journal-entry')
  })

  it('parses write-checked event', () => {
    const result = EngineEventSchema.parse({
      type: 'write-checked',
      at: '2026-01-01T00:00:00Z',
      tool: 'Write',
      filePath: '/src/test.ts',
      allowed: false,
      reason: 'Not in dev state',
    })
    expect(result.type).toBe('write-checked')
  })

  it('parses bash-checked event', () => {
    const result = EngineEventSchema.parse({
      type: 'bash-checked',
      at: '2026-01-01T00:00:00Z',
      tool: 'Bash',
      command: 'git push',
      allowed: true,
    })
    expect(result.type).toBe('bash-checked')
  })

  it('parses plugin-read-checked event', () => {
    const result = EngineEventSchema.parse({
      type: 'plugin-read-checked',
      at: '2026-01-01T00:00:00Z',
      tool: 'Read',
      path: '/plugin/file.ts',
      allowed: false,
    })
    expect(result.type).toBe('plugin-read-checked')
  })

  it('parses idle-checked event', () => {
    const result = EngineEventSchema.parse({
      type: 'idle-checked',
      at: '2026-01-01T00:00:00Z',
      agentName: 'dev-1',
      allowed: true,
    })
    expect(result.type).toBe('idle-checked')
  })

  it('parses identity-verified event', () => {
    const result = EngineEventSchema.parse({
      type: 'identity-verified',
      at: '2026-01-01T00:00:00Z',
      status: 'verified',
      transcriptPath: '/tmp/transcript.jsonl',
    })
    expect(result.type).toBe('identity-verified')
  })

  it('parses context-requested event', () => {
    const result = EngineEventSchema.parse({
      type: 'context-requested',
      at: '2026-01-01T00:00:00Z',
      agentName: 'lead-1',
    })
    expect(result.type).toBe('context-requested')
  })

  it('parses agent-shut-down event', () => {
    const result = EngineEventSchema.parse({
      type: 'agent-shut-down',
      at: '2026-01-01T00:00:00Z',
      agentName: 'dev-1',
    })
    expect(result.type).toBe('agent-shut-down')
  })

  it('rejects unknown event type', () => {
    expect(() =>
      EngineEventSchema.parse({ type: 'unknown-event', at: '2026-01-01T00:00:00Z' }),
    ).toThrow()
  })

  it('rejects event missing required fields', () => {
    expect(() =>
      EngineEventSchema.parse({ type: 'transitioned', at: '2026-01-01T00:00:00Z' }),
    ).toThrow()
  })
})

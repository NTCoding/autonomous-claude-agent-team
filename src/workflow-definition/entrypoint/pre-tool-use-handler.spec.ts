import { WorkflowEngine } from '@ntcoding/agentic-workflow-builder/engine'
import { FeatureTeamWorkflowDefinition } from '../index.js'
import { preToolUseHandler } from './pre-tool-use-handler.js'
import {
  makeDeps,
  planningEvents,
  developingEvents,
} from './cli-test-fixtures.js'

const AT = '2026-01-01T00:00:00Z'

function makeEngine(overrides?: Parameters<typeof makeDeps>[0]) {
  const deps = makeDeps(overrides)
  return new WorkflowEngine(FeatureTeamWorkflowDefinition, deps.engineDeps, deps.workflowDeps)
}

describe('preToolUseHandler', () => {
  it('returns success when all checks pass', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Bash', { command: 'ls' }, '/tmp/transcript.jsonl')
    expect(result.type).toBe('success')
  })

  it('returns blocked when plugin source read is blocked', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => [] },
      },
      workflowDeps: {
        getPluginRoot: () => '/home/.claude/plugins/cache/myplugin',
      },
    })
    const result = preToolUseHandler(
      engine, 'test-session', 'Read',
      { file_path: '/home/.claude/plugins/cache/myplugin/src/index.ts' },
      '/tmp/transcript.jsonl',
    )
    expect(result.type).toBe('blocked')
  })

  it('returns blocked when write is blocked', () => {
    const engine = makeEngine({
      engineDeps: {
        store: {
          sessionExists: () => true,
          readEvents: () => [
            { type: 'transitioned', at: AT, from: 'SPAWN', to: 'RESPAWN' },
          ],
        },
      },
    })
    const result = preToolUseHandler(
      engine, 'test-session', 'Write',
      { file_path: '/project/src/foo.ts' },
      '/tmp/transcript.jsonl',
    )
    expect(result.type).toBe('blocked')
  })

  it('returns blocked when bash command is blocked', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => developingEvents() },
      },
    })
    const result = preToolUseHandler(
      engine, 'test-session', 'Bash',
      { command: 'git commit -m "test"' },
      '/tmp/transcript.jsonl',
    )
    expect(result.type).toBe('blocked')
  })

  it('throws when tool_input contains a non-string value', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    expect(() => preToolUseHandler(
      engine, 'test-session', 'Write',
      { file_path: 42 },
      '/tmp/transcript.jsonl',
    )).toThrow('Expected string or undefined')
  })

  it('records identity-verified event via engine prefix verification', () => {
    const appended: Array<{ firstEventType: string }> = []
    const engine = makeEngine({
      engineDeps: {
        store: {
          sessionExists: () => true,
          readEvents: () => planningEvents(),
          appendEvents: (_sessionId: string, events: ReadonlyArray<{ type: string }>) =>
            appended.push({ firstEventType: events[0]?.type ?? '' }),
        },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Bash', {}, '/tmp/transcript.jsonl')
    expect(result.type).toBe('success')
    expect(appended[0]?.firstEventType).toBe('identity-verified')
  })

  it('blocks when identity is lost', () => {
    const engine = makeEngine({
      engineDeps: {
        transcriptReader: {
          readMessages: () => [
            { id: '1', textContent: 'LEAD: PLANNING' },
            { id: '2', textContent: 'No prefix here' },
          ],
        },
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Bash', {}, '/tmp/transcript.jsonl')
    expect(result.type).toBe('blocked')
  })

  it('resolves path from file_path field', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Read', { file_path: '/project/src/ok.ts' }, undefined)
    expect(result.type).toBe('success')
  })

  it('resolves path from path field when file_path absent', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Glob', { path: '/project/src' }, undefined)
    expect(result.type).toBe('success')
  })

  it('resolves path from pattern field when file_path and path absent', () => {
    const engine = makeEngine({
      engineDeps: {
        store: { sessionExists: () => true, readEvents: () => planningEvents() },
      },
    })
    const result = preToolUseHandler(engine, 'test-session', 'Grep', { pattern: '*.ts' }, undefined)
    expect(result.type).toBe('success')
  })
})

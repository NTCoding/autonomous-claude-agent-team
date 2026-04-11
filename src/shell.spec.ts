import { route, getSessionId, getPluginRoot, getEnvFilePath, getDbPath } from './shell.js'
import type { ShellDeps } from './shell.js'
import { EXIT_ALLOW, EXIT_ERROR } from '@ntcoding/agentic-workflow-builder/cli'
import { homedir } from 'node:os'
import type { WorkflowEventStore } from '@ntcoding/agentic-workflow-builder/engine'
import type { WorkflowDeps } from './workflow-definition/index.js'

const AT = '2026-01-01T00:00:00Z'

function makeShellDeps(overrides?: Partial<ShellDeps>): ShellDeps {
  return {
    getSessionId: () => 'test-session',
    getRepositoryName: () => undefined,
    readStdin: () => JSON.stringify({
      session_id: 'test-session',
      transcript_path: '/test/transcript.jsonl',
      cwd: '/project',
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {},
      tool_use_id: 'tool-1',
    }),
    engineDeps: {
      store: {
        readEvents: () => [{ type: 'session-started', at: AT, transcriptPath: '/test/transcript.jsonl' }],
        appendEvents: () => undefined,
        sessionExists: () => true,
        hasSessionStarted: () => true,
      } satisfies WorkflowEventStore,
      getPluginRoot: () => '/plugin',
      getEnvFilePath: () => '/test/claude.env',
      readFile: () => '',
      appendToFile: () => undefined,
      now: () => AT,
      transcriptReader: { readMessages: () => [] },
    },
    workflowDeps: {
      getGitInfo: () => ({
        currentBranch: 'main',
        workingTreeClean: true,
        headCommit: 'abc123',
        changedFilesVsDefault: [],
        hasCommitsVsDefault: false,
      }),
      checkPrChecks: () => true,
      createDraftPr: () => 99,
      appendIssueChecklist: () => undefined,
      tickFirstUncheckedIteration: () => undefined,
      runEslintOnFiles: () => true,
      fileExists: () => false,
      getPluginRoot: () => '/plugin',
      now: () => AT,
    } satisfies WorkflowDeps,
    analyticsDeps: {
      computeSession: () => 'Session: test\n===',
      computeAll: () => 'Total Sessions: 0',
      computeEventContext: () => 'Context',
    },
    reportDeps: {
      getAnalysisContext: () => '# Context',
      generateReport: () => ({ path: '/tmp/report.html' }),
      readAnalysisFile: () => '# Analysis',
    },
    ...overrides,
  }
}

describe('route', () => {
  it('dispatches init to workflow entrypoint', () => {
    const result = route(['init'], makeShellDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches analyze to analytics entrypoint', () => {
    const result = route(['analyze', '--all'], makeShellDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('Total Sessions: 0')
  })

  it('dispatches view-report to analytics entrypoint', () => {
    const result = route(['view-report', 'abc'], makeShellDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
    expect(result.output).toStrictEqual('# Context')
  })

  it('dispatches workflow commands to workflow entrypoint', () => {
    const result = route(['record-issue', '42'], makeShellDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
  })

  it('dispatches unknown commands to workflow entrypoint which returns error', () => {
    const result = route(['unknown-cmd'], makeShellDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
  })
})

describe('getSessionId', () => {
  it('returns value when CLAUDE_SESSION_ID is set', () => {
    process.env['CLAUDE_SESSION_ID'] = 'abc-123'
    expect(getSessionId()).toStrictEqual('abc-123')
    delete process.env['CLAUDE_SESSION_ID']
  })

  it('throws when CLAUDE_SESSION_ID is absent', () => {
    delete process.env['CLAUDE_SESSION_ID']
    expect(() => getSessionId()).toThrow('CLAUDE_SESSION_ID')
  })
})

describe('getPluginRoot', () => {
  it('returns value when CLAUDE_PLUGIN_ROOT is set', () => {
    process.env['CLAUDE_PLUGIN_ROOT'] = '/plugin'
    expect(getPluginRoot()).toStrictEqual('/plugin')
    delete process.env['CLAUDE_PLUGIN_ROOT']
  })

  it('throws when CLAUDE_PLUGIN_ROOT is absent', () => {
    delete process.env['CLAUDE_PLUGIN_ROOT']
    expect(() => getPluginRoot()).toThrow('CLAUDE_PLUGIN_ROOT')
  })
})

describe('getEnvFilePath', () => {
  it('returns value when CLAUDE_ENV_FILE is set', () => {
    process.env['CLAUDE_ENV_FILE'] = '/test/env'
    expect(getEnvFilePath()).toStrictEqual('/test/env')
    delete process.env['CLAUDE_ENV_FILE']
  })

  it('throws when CLAUDE_ENV_FILE is absent', () => {
    delete process.env['CLAUDE_ENV_FILE']
    expect(() => getEnvFilePath()).toThrow('CLAUDE_ENV_FILE')
  })
})

describe('getDbPath', () => {
  it('returns path under home directory', () => {
    expect(getDbPath()).toStrictEqual(`${homedir()}/.claude/workflow-events.db`)
  })
})

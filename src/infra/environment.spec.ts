import { homedir } from 'node:os'
import { getSessionId, getPluginRoot, getEnvFilePath, getStateFilePath, getDbPath } from './environment.js'

describe('getSessionId', () => {
  it('returns value when CLAUDE_SESSION_ID is set', () => {
    process.env['CLAUDE_SESSION_ID'] = 'abc-123'
    expect(getSessionId()).toStrictEqual('abc-123')
    delete process.env['CLAUDE_SESSION_ID']
  })

  it('throws WorkflowError when CLAUDE_SESSION_ID is absent', () => {
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

  it('throws WorkflowError when CLAUDE_PLUGIN_ROOT is absent', () => {
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

  it('throws WorkflowError when CLAUDE_ENV_FILE is absent', () => {
    delete process.env['CLAUDE_ENV_FILE']
    expect(() => getEnvFilePath()).toThrow('CLAUDE_ENV_FILE')
  })
})

describe('getStateFilePath', () => {
  it('interpolates session ID into path under /tmp/', () => {
    expect(getStateFilePath('abc-123')).toStrictEqual('/tmp/feature-team-state-abc-123.json')
  })

  it('uses different session ID correctly', () => {
    expect(getStateFilePath('xyz-789')).toStrictEqual('/tmp/feature-team-state-xyz-789.json')
  })
})

describe('getDbPath', () => {
  it('returns path under home directory', () => {
    expect(getDbPath()).toStrictEqual(`${homedir()}/.claude/workflow-events.db`)
  })
})

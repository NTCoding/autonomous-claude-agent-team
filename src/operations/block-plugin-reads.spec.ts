import { runBlockPluginReads } from './block-plugin-reads.js'
import type { BlockPluginReadsDeps } from './block-plugin-reads.js'
import type { PreToolUseInput } from '../infra/hook-io.js'

const PLUGIN_ROOT = '/Users/test/.claude/plugins/cache/autonomous-claude-agent-team/autonomous-claude-agent-team/1.8.2'

function makeHookInput(
  toolName: string,
  toolInput: Record<string, unknown> = {},
): PreToolUseInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'tu-1',
  }
}

function makeDeps(): BlockPluginReadsDeps {
  return {
    getPluginRoot: () => PLUGIN_ROOT,
    stateFileExists: () => true,
    getStateFilePath: (id) => `/test/state-${id}.json`,
  }
}

describe('runBlockPluginReads — Read tool', () => {
  it('blocks Read of plugin src files', () => {
    const input = makeHookInput('Read', { file_path: `${PLUGIN_ROOT}/src/operations/init.ts` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(2)
  })

  it('allows Read of agent definition files', () => {
    const input = makeHookInput('Read', { file_path: `${PLUGIN_ROOT}/agents/feature-team-lead.md` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })

  it('allows Read of non-plugin files', () => {
    const input = makeHookInput('Read', { file_path: '/Users/test/project/src/main.ts' })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runBlockPluginReads — Bash tool', () => {
  it('blocks Bash cat of plugin source', () => {
    const input = makeHookInput('Bash', { command: `cat ${PLUGIN_ROOT}/src/infra/hook-io.ts` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(2)
  })

  it('blocks Bash grep of plugin source', () => {
    const input = makeHookInput('Bash', { command: `grep -r "getState" ${PLUGIN_ROOT}/src/` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(2)
  })

  it('allows Bash commands not targeting plugin', () => {
    const input = makeHookInput('Bash', { command: 'npm test' })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })
})

describe('runBlockPluginReads — Glob and Grep tools', () => {
  it('blocks Glob targeting plugin source', () => {
    const input = makeHookInput('Glob', { pattern: `${PLUGIN_ROOT}/src/**/*.ts` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(2)
  })

  it('blocks Grep targeting plugin source', () => {
    const input = makeHookInput('Grep', { path: `${PLUGIN_ROOT}/src/` })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(2)
  })

  it('allows Glob of project files', () => {
    const input = makeHookInput('Glob', { pattern: '/project/src/**/*.ts' })
    const result = runBlockPluginReads(input, makeDeps())
    expect(result.exitCode).toStrictEqual(0)
  })
})

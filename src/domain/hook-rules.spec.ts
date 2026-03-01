import { checkWriteBlock, checkBashWriteBlock, checkCommitBlock, checkIdleAllowed, checkPluginSourceRead } from './hook-rules.js'
import { INITIAL_STATE } from './workflow-state.js'
import type { WorkflowState } from './workflow-state.js'

const respawnState: WorkflowState = { ...INITIAL_STATE, state: 'RESPAWN' }
const developingState: WorkflowState = { ...INITIAL_STATE, state: 'DEVELOPING', commitsBlocked: true }

describe('checkWriteBlock — RESPAWN write blocking', () => {
  it('blocks Write tool during RESPAWN', () => {
    const result = checkWriteBlock(respawnState, 'Write', '/src/foo.ts')
    expect(result.allow).toStrictEqual(false)
  })

  it('blocks Edit tool during RESPAWN', () => {
    const result = checkWriteBlock(respawnState, 'Edit', '/src/foo.ts')
    expect(result.allow).toStrictEqual(false)
  })

  it('allows writes to feature-team state files during RESPAWN', () => {
    const result = checkWriteBlock(respawnState, 'Write', '/plugin/root/feature-team-state-abc.json')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows non-write tools during RESPAWN', () => {
    const result = checkWriteBlock(respawnState, 'Bash', '/src/foo.ts')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows writes in non-RESPAWN states', () => {
    const result = checkWriteBlock(developingState, 'Write', '/src/foo.ts')
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkBashWriteBlock — RESPAWN git blocking', () => {
  it('blocks git commit during RESPAWN via Bash', () => {
    const result = checkBashWriteBlock(respawnState, 'Bash', 'git commit -m "foo"')
    expect(result.allow).toStrictEqual(false)
  })

  it('allows non-git-commit bash during RESPAWN', () => {
    const result = checkBashWriteBlock(respawnState, 'Bash', 'npm test')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows non-Bash tools during RESPAWN', () => {
    const result = checkBashWriteBlock(respawnState, 'Write', 'git commit -m "foo"')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows everything in non-RESPAWN states', () => {
    const result = checkBashWriteBlock(developingState, 'Bash', 'git commit -m "foo"')
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkCommitBlock — commit blocking by commitsBlocked field', () => {
  it('blocks git commit when commitsBlocked is true', () => {
    const result = checkCommitBlock(developingState, 'git commit -m "foo"')
    expect(result.allow).toStrictEqual(false)
  })

  it('blocks git push when commitsBlocked is true', () => {
    const result = checkCommitBlock(developingState, 'git push origin main')
    expect(result.allow).toStrictEqual(false)
  })

  it('allows non-git-commit commands when commitsBlocked', () => {
    const result = checkCommitBlock(developingState, 'npm test')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows git commit when commitsBlocked is false', () => {
    const committingState = { ...INITIAL_STATE, state: 'COMMITTING' as const }
    const result = checkCommitBlock(committingState, 'git commit -m "foo"')
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkIdleAllowed — lead idle rules', () => {
  it('blocks lead idle in non-terminal states', () => {
    const result = checkIdleAllowed(developingState, 'feature-team-lead')
    expect(result.allow).toStrictEqual(false)
    if (!result.allow) expect(result.reason).toContain('DEVELOPING')
  })

  it('allows lead idle in BLOCKED state', () => {
    const blocked = { ...INITIAL_STATE, state: 'BLOCKED' as const }
    const result = checkIdleAllowed(blocked, 'feature-team-lead')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows lead idle in COMPLETE state', () => {
    const complete = { ...INITIAL_STATE, state: 'COMPLETE' as const }
    const result = checkIdleAllowed(complete, 'feature-team-lead')
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkIdleAllowed — developer idle rules', () => {
  it('blocks developer idle in DEVELOPING without signalling done', () => {
    const result = checkIdleAllowed(developingState, 'developer-1')
    expect(result.allow).toStrictEqual(false)
    if (!result.allow) expect(result.reason).toContain('signal')
  })

  it('allows developer idle in DEVELOPING when done', () => {
    const state = { ...developingState, developerDone: true }
    const result = checkIdleAllowed(state, 'developer-1')
    expect(result.allow).toStrictEqual(true)
  })

  it('allows developer idle in non-DEVELOPING states', () => {
    const reviewing = { ...INITIAL_STATE, state: 'REVIEWING' as const }
    const result = checkIdleAllowed(reviewing, 'developer-1')
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkIdleAllowed — reviewer has no restrictions', () => {
  it('allows reviewer idle in any state', () => {
    const result = checkIdleAllowed(developingState, 'reviewer-1')
    expect(result.allow).toStrictEqual(true)
  })
})

const PLUGIN_ROOT = '/Users/test/.claude/plugins/cache/autonomous-claude-agent-team/test/1.0.0'

describe('checkPluginSourceRead — Read tool', () => {
  it('blocks Read of plugin src files', () => {
    const result = checkPluginSourceRead('Read', `${PLUGIN_ROOT}/src/init.ts`, '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(false)
  })

  it('allows Read of agent definition files', () => {
    const result = checkPluginSourceRead('Read', `${PLUGIN_ROOT}/agents/lead.md`, '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(true)
  })

  it('allows Read of non-plugin files', () => {
    const result = checkPluginSourceRead('Read', '/project/src/main.ts', '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkPluginSourceRead — Bash tool', () => {
  it('blocks Bash cat of plugin source', () => {
    const result = checkPluginSourceRead('Bash', '', `cat ${PLUGIN_ROOT}/src/hook-io.ts`, PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(false)
  })

  it('blocks Bash grep of plugin source', () => {
    const result = checkPluginSourceRead('Bash', '', `grep -r "state" ${PLUGIN_ROOT}/src/`, PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(false)
  })

  it('allows Bash commands not targeting plugin', () => {
    const result = checkPluginSourceRead('Bash', '', 'npm test', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(true)
  })

  it('allows Bash non-read commands even with plugin path', () => {
    const result = checkPluginSourceRead('Bash', '', `echo ${PLUGIN_ROOT}/src/foo`, PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(true)
  })
})

describe('checkPluginSourceRead — Glob and Grep tools', () => {
  it('blocks Glob targeting plugin source', () => {
    const result = checkPluginSourceRead('Glob', `${PLUGIN_ROOT}/src/**/*.ts`, '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(false)
  })

  it('blocks Grep targeting plugin source', () => {
    const result = checkPluginSourceRead('Grep', `${PLUGIN_ROOT}/src/`, '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(false)
  })

  it('allows Glob of non-plugin files', () => {
    const result = checkPluginSourceRead('Glob', '/project/**/*.ts', '', PLUGIN_ROOT)
    expect(result.allow).toStrictEqual(true)
  })
})

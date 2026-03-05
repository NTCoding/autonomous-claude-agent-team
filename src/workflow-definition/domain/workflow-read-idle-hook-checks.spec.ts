import {
  spec,
  eventsToDeveloping,
  eventsToReviewing,
  developerDoneSignaled,
  transitioned,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('checkPluginSourceRead', () => {
    it('blocks Read on plugin source path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/src/bar.ts', ''))
      expect(result.pass).toBe(false)
    })

    it('allows Read on non-plugin path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Read', '/home/project/src/bar.ts', ''))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows Read on agent .md files within plugin cache', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/plugin/agents/developer.md', ''))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks Bash cat on plugin source', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Bash', '', 'cat /home/.claude/plugins/cache/foo/src/bar.ts'))
      expect(result.pass).toBe(false)
    })

    it('allows Bash cat on non-plugin path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Bash', '', 'cat /home/project/src/bar.ts'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks Grep on plugin source path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Grep', '/home/.claude/plugins/cache/foo/src/', ''))
      expect(result.pass).toBe(false)
    })

    it('blocks Glob on plugin source path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Glob', '/home/.claude/plugins/cache/foo/src/', ''))
      expect(result.pass).toBe(false)
    })

    it('allows Bash non-read commands on plugin source path', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Bash', '', 'rm /home/.claude/plugins/cache/foo/src/bar.ts'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('appends plugin-read-checked event with allowed=false and reason when Read blocked', () => {
      const { events } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Read', '/home/.claude/plugins/cache/foo/src/bar.ts', ''))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Read',
        path: '/home/.claude/plugins/cache/foo/src/bar.ts',
        allowed: false,
        reason: expect.stringContaining('not allowed'),
      })
    })

    it('appends plugin-read-checked event with allowed=false and path=command when Bash cat blocked', () => {
      const { events } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Bash', '', 'cat /home/.claude/plugins/cache/foo/src/bar.ts'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Bash',
        path: 'cat /home/.claude/plugins/cache/foo/src/bar.ts',
        allowed: false,
        reason: expect.stringContaining('not allowed'),
      })
    })

    it('appends plugin-read-checked event with allowed=true when read is allowed', () => {
      const { events } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Read', '/home/project/src/bar.ts', ''))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Read',
        path: '/home/project/src/bar.ts',
        allowed: true,
      })
    })

    it('appends plugin-read-checked event with allowed=true using command as path when filePath is empty', () => {
      const { events } = spec
        .given()
        .when((wf) => wf.checkPluginSourceRead('Bash', '', 'cat /home/project/src/bar.ts'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'plugin-read-checked',
        tool: 'Bash',
        path: 'cat /home/project/src/bar.ts',
        allowed: true,
      })
    })
  })

  describe('checkIdleAllowed', () => {
    it('allows lead idle in BLOCKED', () => {
      const { result } = spec
        .given(transitioned('SPAWN', 'BLOCKED'))
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows lead idle in COMPLETE', () => {
      const { result } = spec
        .given(transitioned('SPAWN', 'COMPLETE'))
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks lead idle in DEVELOPING', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      expect(result.pass).toBe(false)
    })

    it('allows developer idle when developerDone', () => {
      const { result } = spec
        .given(...eventsToDeveloping(), developerDoneSignaled())
        .when((wf) => wf.checkIdleAllowed('developer-1'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks developer idle when not done', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('developer-1'))
      expect(result.pass).toBe(false)
    })

    it('allows developer idle in non-DEVELOPING states', () => {
      const { result } = spec
        .given(...eventsToReviewing())
        .when((wf) => wf.checkIdleAllowed('developer-1'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows unknown agent idle', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('reviewer-1'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('appends idle-checked event with allowed=true when lead idle is allowed', () => {
      const { events } = spec
        .given(transitioned('SPAWN', 'BLOCKED'))
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'idle-checked', agentName: 'lead-1', allowed: true })
    })

    it('appends idle-checked event with allowed=false and reason when lead idle is blocked', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'idle-checked',
        agentName: 'lead-1',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends idle-checked event with allowed=true when developer idle is allowed', () => {
      const { events } = spec
        .given(...eventsToDeveloping(), developerDoneSignaled())
        .when((wf) => wf.checkIdleAllowed('developer-1'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'idle-checked', agentName: 'developer-1', allowed: true })
    })

    it('appends idle-checked event with allowed=false and reason when developer idle is blocked', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('developer-1'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'idle-checked',
        agentName: 'developer-1',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends idle-checked event with allowed=true for unknown agent', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkIdleAllowed('reviewer-1'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'idle-checked', agentName: 'reviewer-1', allowed: true })
    })

    it('does not include reason in idle-checked event when allowed', () => {
      const { events } = spec
        .given(transitioned('SPAWN', 'BLOCKED'))
        .when((wf) => wf.checkIdleAllowed('lead-1'))
      const event = events[0]
      expect(event).toMatchObject({ type: 'idle-checked', allowed: true })
      expect(event).not.toMatchObject({ reason: expect.anything() })
    })
  })
})

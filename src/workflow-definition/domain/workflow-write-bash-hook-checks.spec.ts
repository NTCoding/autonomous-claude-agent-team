import {
  spec,
  eventsToDeveloping,
  eventsToReviewing,
  eventsToCommitting,
  eventsToRespawn,
  eventsToPlanning,
  transitioned,
  agentShutDown,
  iterationTaskAssigned,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('checkWriteAllowed', () => {
    it('allows writes in non-RESPAWN states', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkWriteAllowed('Write', '/some/file.ts'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks Write tool in RESPAWN with generic message', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Write', '/some/file.ts'))
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toBe("Write operation 'Write' is forbidden in state: RESPAWN")
      }
    })

    it('blocks Edit tool in RESPAWN', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Edit', '/some/file.ts'))
      expect(result.pass).toBe(false)
    })

    it('blocks NotebookEdit tool in RESPAWN', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('NotebookEdit', '/some/file.ts'))
      expect(result.pass).toBe(false)
    })

    it('allows non-write tools in RESPAWN', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Read', '/some/file.ts'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows state file writes in RESPAWN', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Write', '/tmp/feature-team-state-abc.json'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('appends write-checked event with allowed=true when no write restriction', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkWriteAllowed('Write', '/some/file.ts'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'write-checked', tool: 'Write', filePath: '/some/file.ts', allowed: true })
    })

    it('appends write-checked event with allowed=true for non-write tool in RESPAWN', () => {
      const { events } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Read', '/some/file.ts'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'write-checked', tool: 'Read', filePath: '/some/file.ts', allowed: true })
    })

    it('appends write-checked event with allowed=true for state file in RESPAWN', () => {
      const { events } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Write', '/tmp/feature-team-state-abc.json'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'write-checked', tool: 'Write', filePath: '/tmp/feature-team-state-abc.json', allowed: true })
    })

    it('appends write-checked event with allowed=false and reason when blocked', () => {
      const { events } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkWriteAllowed('Write', '/some/file.ts'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'write-checked',
        tool: 'Write',
        filePath: '/some/file.ts',
        allowed: false,
        reason: "Write operation 'Write' is forbidden in state: RESPAWN",
      })
    })
  })

  describe('checkBashAllowed', () => {
    it('allows non-Bash tools', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Write', 'git commit'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows non-git commands in DEVELOPING', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Bash', 'npm test'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks git commit in DEVELOPING', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(result.pass).toBe(false)
    })

    it('blocks git push in REVIEWING', () => {
      const { result } = spec
        .given(...eventsToReviewing())
        .when((wf) => wf.checkBashAllowed('Bash', 'git push origin main'))
      expect(result.pass).toBe(false)
    })

    it('blocks git commit in RESPAWN with write-block message', () => {
      const { result } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('RESPAWN')
      }
    })

    it('allows git commit in COMMITTING (exempt via allowForbidden)', () => {
      const { result } = spec
        .given(...eventsToCommitting())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows git push in COMMITTING (exempt via allowForbidden)', () => {
      const { result } = spec
        .given(...eventsToCommitting())
        .when((wf) => wf.checkBashAllowed('Bash', 'git push origin main'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('allows git commit in SPAWN', () => {
      const { result } = spec
        .given()
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(result).toStrictEqual({ pass: true })
    })

    it('blocks git checkout in DEVELOPING', () => {
      const { result } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Bash', 'git checkout main'))
      expect(result.pass).toBe(false)
    })

    it('appends bash-checked event with allowed=true for non-Bash tool', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Write', 'git commit'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'bash-checked', tool: 'Write', command: 'git commit', allowed: true })
    })

    it('appends bash-checked event with allowed=true for allowed Bash command', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Bash', 'npm test'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'bash-checked', tool: 'Bash', command: 'npm test', allowed: true })
    })

    it('appends bash-checked event with allowed=false and reason when git commit blocked in DEVELOPING', () => {
      const { events } = spec
        .given(...eventsToDeveloping())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'bash-checked',
        tool: 'Bash',
        command: 'git commit -m "test"',
        allowed: false,
        reason: expect.stringContaining('DEVELOPING'),
      })
    })

    it('appends bash-checked event with allowed=false and reason when git commit blocked in RESPAWN', () => {
      const { events } = spec
        .given(...eventsToRespawn())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'bash-checked',
        tool: 'Bash',
        command: 'git commit -m "test"',
        allowed: false,
        reason: expect.stringContaining('RESPAWN'),
      })
    })

    it('appends bash-checked event with allowed=true for exempt git commit in COMMITTING', () => {
      const { events } = spec
        .given(...eventsToCommitting())
        .when((wf) => wf.checkBashAllowed('Bash', 'git commit -m "test"'))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'bash-checked', tool: 'Bash', command: 'git commit -m "test"', allowed: true })
    })
  })
})

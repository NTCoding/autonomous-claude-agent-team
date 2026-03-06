import {
  spec,
  agentRegistered,
} from './workflow-test-fixtures.js'

describe('Workflow', () => {
  describe('shutDown', () => {
    it('removes agent from activeAgents', () => {
      const { result, state, events } = spec
        .given(agentRegistered('developer-1'), agentRegistered('reviewer-1'))
        .when((wf) => wf.shutDown('developer-1'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.activeAgents).toStrictEqual(['reviewer-1'])
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-shut-down', agentName: 'developer-1' })])
      )
    })

    it('handles unknown agent gracefully', () => {
      const { result, state } = spec
        .given(agentRegistered('developer-1'))
        .when((wf) => wf.shutDown('unknown-1'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.activeAgents).toStrictEqual(['developer-1'])
    })
  })

  describe('registerAgent', () => {
    it('adds agent to activeAgents', () => {
      const { result, state, events } = spec
        .given()
        .when((wf) => wf.registerAgent('developer-1', 'agent-abc'))
      expect(result).toStrictEqual({ pass: true })
      expect(state.activeAgents).toStrictEqual(['developer-1'])
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-registered', agentType: 'developer-1', agentId: 'agent-abc' })])
      )
    })

    it('does not duplicate agent', () => {
      const { state, events } = spec
        .given(agentRegistered('developer-1'))
        .when((wf) => wf.registerAgent('developer-1', 'agent-xyz'))
      expect(state.activeAgents).toStrictEqual(['developer-1'])
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'agent-registered', agentType: 'developer-1', agentId: 'agent-xyz' })])
      )
    })
  })

  describe('writeJournal', () => {
    it('appends journal-entry event with agent name and content', () => {
      const { result, events } = spec.given().when((wf) => wf.writeJournal('developer-1', 'Completed auth module'))
      expect(result).toStrictEqual({ pass: true })
      expect(events).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'journal-entry', agentName: 'developer-1', content: 'Completed auth module' }),
        ])
      )
    })

    it('returns fail when content is empty', () => {
      const { result } = spec.given().when((wf) => wf.writeJournal('developer-1', ''))
      expect(result.pass).toBe(false)
    })
  })

  describe('requestContext', () => {
    it('appends context-requested event and returns pass', () => {
      const { result, events } = spec.given().when((wf) => wf.requestContext('developer-1'))
      expect(result).toStrictEqual({ pass: true })
      expect(events).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'context-requested', agentName: 'developer-1' })])
      )
    })
  })
})

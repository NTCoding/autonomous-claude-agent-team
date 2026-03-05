import {
  buildLeadPrefix,
  buildRecoveryMessage,
  checkLeadIdentity,
} from './identity-rules.js'
import type { AssistantMessage } from './identity-rules.js'

const leadMsg = (id: string, hasLead = true): AssistantMessage => ({
  id,
  hasTextContent: true,
  startsWithLeadPrefix: hasLead,
})
const silentMsg = (id: string): AssistantMessage => ({ id, hasTextContent: false, startsWithLeadPrefix: false })

describe('buildLeadPrefix', () => {
  it('includes emoji for DEVELOPING', () => {
    const prefix = buildLeadPrefix('DEVELOPING', '🔨')
    expect(prefix).toContain('🔨')
    expect(prefix).toContain('LEAD: DEVELOPING')
  })
})

describe('buildRecoveryMessage', () => {
  it('includes agent file path with CLAUDE_PLUGIN_ROOT variable', () => {
    const msg = buildRecoveryMessage('DEVELOPING', '🔨')
    expect(msg).toContain('${CLAUDE_PLUGIN_ROOT}/agents/feature-team-lead.md')
  })

  it('includes correct state procedure file with hyphenated name', () => {
    const msg = buildRecoveryMessage('CR_REVIEW', '🐰')
    expect(msg).toContain('${CLAUDE_PLUGIN_ROOT}/states/cr-review.md')
  })

  it('includes the expected prefix in recovery message', () => {
    const msg = buildRecoveryMessage('PLANNING', '⚪')
    expect(msg).toContain('⚪ LEAD: PLANNING')
  })
})

describe('checkLeadIdentity — never spoken', () => {
  it('returns never-spoken when no lead messages exist', () => {
    const messages: AssistantMessage[] = [leadMsg('1', false)]
    const result = checkLeadIdentity(messages, 'SPAWN', '🟣')
    expect(result.status).toStrictEqual('never-spoken')
  })

  it('returns never-spoken for empty transcript', () => {
    const result = checkLeadIdentity([], 'SPAWN', '🟣')
    expect(result.status).toStrictEqual('never-spoken')
  })
})

describe('checkLeadIdentity — silent turn', () => {
  it('returns silent-turn when all messages after lead are tool-only', () => {
    const messages: AssistantMessage[] = [leadMsg('1'), silentMsg('2')]
    const result = checkLeadIdentity(messages, 'SPAWN', '🟣')
    expect(result.status).toStrictEqual('silent-turn')
  })
})

describe('checkLeadIdentity — verified', () => {
  it('returns verified when last text message has lead prefix', () => {
    const messages: AssistantMessage[] = [leadMsg('1'), leadMsg('2')]
    const result = checkLeadIdentity(messages, 'DEVELOPING', '🔨')
    expect(result.status).toStrictEqual('verified')
  })
})

describe('checkLeadIdentity — lost', () => {
  it('returns lost when last text message lacks lead prefix', () => {
    const messages: AssistantMessage[] = [leadMsg('1'), leadMsg('2', false)]
    const result = checkLeadIdentity(messages, 'DEVELOPING', '🔨')
    expect(result.status).toStrictEqual('lost')
  })

  it('includes recovery message with state info', () => {
    const messages: AssistantMessage[] = [leadMsg('1'), leadMsg('2', false)]
    const result = checkLeadIdentity(messages, 'DEVELOPING', '🔨')
    if (result.status === 'lost') expect(result.recoveryMessage).toContain('DEVELOPING')
  })
})

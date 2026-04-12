import { checkIdentity } from './identity-verification.js'
import type { TranscriptMessage } from './transcript-reader.js'

const PREFIX_PATTERN = /^LEAD:/m

const textMsg = (id: string, text: string): TranscriptMessage => ({ id, textContent: text })
const prefixMsg = (id: string): TranscriptMessage => ({ id, textContent: 'LEAD: PLANNING\nSome content' })
const silentMsg = (id: string): TranscriptMessage => ({ id, textContent: undefined })

describe('checkIdentity — never-spoken', () => {
  it('returns lost when assistant has spoken without required prefix', () => {
    const messages = [textMsg('1', 'Hello world')]
    expect(checkIdentity(messages, PREFIX_PATTERN)).toStrictEqual({ status: 'lost' })
  })

  it('returns never-spoken for empty transcript', () => {
    expect(checkIdentity([], PREFIX_PATTERN)).toStrictEqual({ status: 'never-spoken' })
  })
})

describe('checkIdentity — silent-turn', () => {
  it('returns silent-turn when last message has no text content', () => {
    const messages = [prefixMsg('1'), silentMsg('2')]
    expect(checkIdentity(messages, PREFIX_PATTERN)).toStrictEqual({ status: 'silent-turn' })
  })
})

describe('checkIdentity — verified', () => {
  it('returns verified when last text message matches prefix', () => {
    const messages = [prefixMsg('1'), prefixMsg('2')]
    expect(checkIdentity(messages, PREFIX_PATTERN)).toStrictEqual({ status: 'verified' })
  })
})

describe('checkIdentity — lost', () => {
  it('returns lost for real assistant text without required prefix', () => {
    const messages = [
      textMsg('msg_d7ea04a13001jmygPk4STr8Gxg', "[TDD: RED] Minimal empty-route validation is being added for `@HttpCall('<route>')`."),
    ]
    expect(checkIdentity(messages, PREFIX_PATTERN)).toStrictEqual({ status: 'lost' })
  })

  it('returns lost when last text message does not match prefix', () => {
    const messages = [prefixMsg('1'), textMsg('2', 'No prefix here')]
    expect(checkIdentity(messages, PREFIX_PATTERN)).toStrictEqual({ status: 'lost' })
  })
})

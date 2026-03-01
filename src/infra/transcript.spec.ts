import { readTranscriptMessages } from './transcript.js'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PLUGIN_TEST_DIR = join(import.meta.dirname, '../../.claude/plugins/autonomous-claude-agent-team')
const TEST_FILE = join(PLUGIN_TEST_DIR, 'test-transcript-spec.jsonl')

beforeAll(() => { mkdirSync(PLUGIN_TEST_DIR, { recursive: true }) })

afterEach(() => {
  try { unlinkSync(TEST_FILE) } catch (_cause) { }
})

function writeLine(obj: unknown): string {
  return JSON.stringify(obj)
}

function makeAssistantMessage(id: string, text: string): string {
  return writeLine({
    type: 'message',
    role: 'assistant',
    id,
    content: [{ type: 'text', text }],
  })
}

describe('readTranscriptMessages — filtering', () => {
  it('returns empty array for empty file', () => {
    writeFileSync(TEST_FILE, '', 'utf-8')
    expect(readTranscriptMessages(TEST_FILE)).toStrictEqual([])
  })

  it('skips non-assistant message lines', () => {
    const content = [
      writeLine({ type: 'message', role: 'user', id: 'u1', content: [] }),
      writeLine({ type: 'other_event', data: {} }),
    ].join('\n')
    writeFileSync(TEST_FILE, content, 'utf-8')
    expect(readTranscriptMessages(TEST_FILE)).toStrictEqual([])
  })

  it('skips malformed JSON lines', () => {
    writeFileSync(TEST_FILE, 'not valid json\n', 'utf-8')
    expect(readTranscriptMessages(TEST_FILE)).toStrictEqual([])
  })
})

describe('readTranscriptMessages — message parsing', () => {
  it('extracts assistant message with text content', () => {
    writeFileSync(TEST_FILE, makeAssistantMessage('msg1', 'Hello world'), 'utf-8')
    const messages = readTranscriptMessages(TEST_FILE)
    expect(messages[0]?.id).toStrictEqual('msg1')
    expect(messages[0]?.hasTextContent).toStrictEqual(true)
  })

  it('detects LEAD prefix pattern', () => {
    writeFileSync(TEST_FILE, makeAssistantMessage('msg1', 'LEAD: PLANNING\nSome content'), 'utf-8')
    const messages = readTranscriptMessages(TEST_FILE)
    expect(messages[0]?.startsWithLeadPrefix).toStrictEqual(true)
  })

  it('marks non-LEAD messages as not starting with lead prefix', () => {
    writeFileSync(TEST_FILE, makeAssistantMessage('msg1', 'Regular message'), 'utf-8')
    const messages = readTranscriptMessages(TEST_FILE)
    expect(messages[0]?.startsWithLeadPrefix).toStrictEqual(false)
  })

  it('parses multiple messages in order', () => {
    const content = [
      makeAssistantMessage('msg1', 'First'),
      makeAssistantMessage('msg2', 'LEAD: PLANNING'),
    ].join('\n')
    writeFileSync(TEST_FILE, content, 'utf-8')
    const messages = readTranscriptMessages(TEST_FILE)
    expect(messages).toHaveLength(2)
    expect(messages[1]?.startsWithLeadPrefix).toStrictEqual(true)
  })

  it('marks message with only tool-use content as not having text content', () => {
    const line = JSON.stringify({
      type: 'message',
      role: 'assistant',
      id: 'msg1',
      content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }],
    })
    writeFileSync(TEST_FILE, line, 'utf-8')
    const messages = readTranscriptMessages(TEST_FILE)
    expect(messages[0]?.hasTextContent).toStrictEqual(false)
  })
})

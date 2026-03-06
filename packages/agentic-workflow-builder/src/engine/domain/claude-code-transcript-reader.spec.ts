import { ClaudeCodeTranscriptReader } from './claude-code-transcript-reader.js'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../../../.test-transcripts')
const TEST_FILE = join(TEST_DIR, 'test-transcript.jsonl')

const reader = new ClaudeCodeTranscriptReader()

beforeAll(() => { mkdirSync(TEST_DIR, { recursive: true }) })
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

describe('ClaudeCodeTranscriptReader — filtering', () => {
  it('returns empty array for empty file', () => {
    writeFileSync(TEST_FILE, '', 'utf-8')
    expect(reader.readMessages(TEST_FILE)).toStrictEqual([])
  })

  it('skips non-assistant message lines', () => {
    const content = [
      writeLine({ type: 'message', role: 'user', id: 'u1', content: [] }),
      writeLine({ type: 'other_event', data: {} }),
    ].join('\n')
    writeFileSync(TEST_FILE, content, 'utf-8')
    expect(reader.readMessages(TEST_FILE)).toStrictEqual([])
  })

  it('skips malformed JSON lines', () => {
    writeFileSync(TEST_FILE, 'not valid json\n', 'utf-8')
    expect(reader.readMessages(TEST_FILE)).toStrictEqual([])
  })
})

describe('ClaudeCodeTranscriptReader — message parsing', () => {
  it('extracts assistant message with text content', () => {
    writeFileSync(TEST_FILE, makeAssistantMessage('msg1', 'Hello world'), 'utf-8')
    const messages = reader.readMessages(TEST_FILE)
    expect(messages[0]?.id).toStrictEqual('msg1')
    expect(messages[0]?.textContent).toStrictEqual('Hello world')
  })

  it('returns textContent as undefined for tool-only messages', () => {
    const line = JSON.stringify({
      type: 'message',
      role: 'assistant',
      id: 'msg1',
      content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }],
    })
    writeFileSync(TEST_FILE, line, 'utf-8')
    const messages = reader.readMessages(TEST_FILE)
    expect(messages[0]?.textContent).toBeUndefined()
  })

  it('parses multiple messages in order', () => {
    const content = [
      makeAssistantMessage('msg1', 'First'),
      makeAssistantMessage('msg2', 'Second'),
    ].join('\n')
    writeFileSync(TEST_FILE, content, 'utf-8')
    const messages = reader.readMessages(TEST_FILE)
    expect(messages).toStrictEqual([
      expect.objectContaining({ id: 'msg1', textContent: 'First' }),
      expect.objectContaining({ id: 'msg2', textContent: 'Second' }),
    ])
  })
})

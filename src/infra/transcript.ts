import { openSync, readSync, statSync, closeSync } from 'node:fs'
import { z } from 'zod'
import type { AssistantMessage } from '../domain/identity-rules.js'
import { LEAD_PREFIX_PATTERN } from '../domain/identity-rules.js'

const READ_TAIL_BYTES = 50_000

const TextBlock = z.object({ type: z.literal('text'), text: z.string() })
const OtherBlock = z.object({ type: z.string() })
const ContentBlock = z.union([TextBlock, OtherBlock])

const AssistantEntry = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  id: z.string(),
  content: z.array(ContentBlock),
})

type AssistantEntry = z.infer<typeof AssistantEntry>

export function readTranscriptMessages(transcriptPath: string): readonly AssistantMessage[] {
  const tail = readFileTail(transcriptPath)
  return parseJsonlLines(tail)
}

function readFileTail(filePath: string): string {
  const fileSize = statSync(filePath).size
  const offset = Math.max(0, fileSize - READ_TAIL_BYTES)
  const bytesToRead = fileSize - offset
  const buffer = Buffer.alloc(bytesToRead)
  const fd = openSync(filePath, 'r')
  readSync(fd, buffer, 0, bytesToRead, offset)
  closeSync(fd)
  return buffer.toString('utf-8')
}

function parseJsonlLines(content: string): readonly AssistantMessage[] {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => parseJsonlLine(line))
}

function parseJsonlLine(line: string): AssistantMessage[] {
  const entry = tryParseEntry(line)
  if (!entry) {
    return []
  }
  return [toAssistantMessage(entry)]
}

function tryParseEntry(line: string): AssistantEntry | undefined {
  try {
    const result = AssistantEntry.safeParse(JSON.parse(line))
    if (result.success) {
      return result.data
    }
    return undefined
  } catch (_cause) {
    return undefined
  }
}

function toAssistantMessage(entry: AssistantEntry): AssistantMessage {
  const textContent = extractFirstText(entry)
  return {
    id: entry.id,
    hasTextContent: textContent !== undefined,
    startsWithLeadPrefix:
      textContent !== undefined && LEAD_PREFIX_PATTERN.test(textContent),
  }
}

function extractFirstText(entry: AssistantEntry): string | undefined {
  for (const block of entry.content) {
    const result = TextBlock.safeParse(block)
    if (result.success) {
      return result.data.text
    }
  }
  return undefined
}

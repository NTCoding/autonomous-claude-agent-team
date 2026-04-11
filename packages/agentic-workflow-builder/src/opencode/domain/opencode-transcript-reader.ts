import Database from 'better-sqlite3'
import { z } from 'zod'
import type { TranscriptMessage, TranscriptReader } from '../../engine/index.js'

const TextPart = z.object({ type: z.literal('text'), text: z.string() })

const MessageData = z.object({
  parts: z.array(z.unknown()),
})

const MessageRow = z.object({
  id: z.string(),
  data: z.string(),
})

export class OpenCodeTranscriptReader implements TranscriptReader {
  constructor(private readonly sessionId: string) {}

  readMessages(dbPath: string): readonly TranscriptMessage[] {
    try {
      const db = new Database(dbPath, { readonly: true })
      try {
        return this.queryMessages(db)
      } finally {
        db.close()
      }
    } catch {
      return []
    }
  }

  private queryMessages(db: Database.Database): readonly TranscriptMessage[] {
    return db
      .prepare(
        `SELECT id, data FROM message
         WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'
         ORDER BY time_created ASC`,
      )
      .all(this.sessionId)
      .flatMap((row) => this.parseRow(row))
  }

  private parseRow(row: unknown): TranscriptMessage[] {
    const rowResult = MessageRow.safeParse(row)
    /* v8 ignore next */
    if (!rowResult.success) return []
    const dataResult = MessageData.safeParse(JSON.parse(rowResult.data.data))
    if (!dataResult.success) return []
    return [{ id: rowResult.data.id, textContent: extractFirstText(dataResult.data.parts) }]
  }
}

function extractFirstText(parts: readonly unknown[]): string | undefined {
  for (const part of parts) {
    const result = TextPart.safeParse(part)
    if (result.success) return result.data.text
  }
  return undefined
}

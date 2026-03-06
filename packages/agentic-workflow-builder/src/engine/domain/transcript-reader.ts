export type TranscriptMessage = {
  readonly id: string
  readonly textContent: string | undefined
}

export interface TranscriptReader {
  readMessages(transcriptPath: string): readonly TranscriptMessage[]
}

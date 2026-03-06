import type { TranscriptMessage } from './transcript-reader.js'

export type PrefixConfig = {
  readonly pattern: RegExp
  readonly buildRecoveryMessage: (state: string, emoji: string, pluginRoot: string) => string
}

export type IdentityCheckResult =
  | { readonly status: 'verified' }
  | { readonly status: 'never-spoken' }
  | { readonly status: 'silent-turn' }
  | { readonly status: 'lost' }

export function checkIdentity(
  messages: readonly TranscriptMessage[],
  pattern: RegExp,
): IdentityCheckResult {
  const hasEverSpokenWithPrefix = messages.some(
    (m) => m.textContent !== undefined && pattern.test(m.textContent),
  )

  if (!hasEverSpokenWithPrefix) {
    return { status: 'never-spoken' }
  }

  const lastMessage = messages.at(-1)
  if (lastMessage?.textContent === undefined) {
    return { status: 'silent-turn' }
  }

  if (pattern.test(lastMessage.textContent)) {
    return { status: 'verified' }
  }

  return { status: 'lost' }
}

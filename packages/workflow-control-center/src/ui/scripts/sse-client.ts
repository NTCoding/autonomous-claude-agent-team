export type SseClientCallbacks = {
  onNewEvent?: (data: Record<string, unknown>) => void
  onStateChange?: (data: { sessionId: string; currentState: string; previousState: string }) => void
  onSessionStarted?: (data: { sessionId: string }) => void
  onConnected?: () => void
}

export function createSseClient(callbacks: SseClientCallbacks, sessionFilter?: string): EventSource {
  const url = sessionFilter ? `/events?session=${sessionFilter}` : '/events'
  const source = new EventSource(url)

  source.addEventListener('connected', () => {
    callbacks.onConnected?.()
  })

  source.addEventListener('new-event', (e: MessageEvent) => {
    const data = JSON.parse(e.data as string) as Record<string, unknown>
    callbacks.onNewEvent?.(data)
  })

  source.addEventListener('state-change', (e: MessageEvent) => {
    const data = JSON.parse(e.data as string) as { sessionId: string; currentState: string; previousState: string }
    callbacks.onStateChange?.(data)
  })

  source.addEventListener('session-started', (e: MessageEvent) => {
    const data = JSON.parse(e.data as string) as { sessionId: string }
    callbacks.onSessionStarted?.(data)
  })

  return source
}

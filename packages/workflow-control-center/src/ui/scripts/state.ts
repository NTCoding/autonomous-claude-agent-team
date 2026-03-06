type Listener = () => void

export type AppState = {
  sessions: Array<Record<string, unknown>>
  currentSession: Record<string, unknown> | null
  analyticsOverview: Record<string, unknown> | null
  comparison: Record<string, unknown> | null
  loading: boolean
  error: string | null
  selectedForCompare: Array<string>
}

const state: AppState = {
  sessions: [],
  currentSession: null,
  analyticsOverview: null,
  comparison: null,
  loading: false,
  error: null,
  selectedForCompare: [],
}

const listeners: Array<Listener> = []

export function getState(): Readonly<AppState> {
  return state
}

export function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial)
  for (const listener of listeners) {
    listener()
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

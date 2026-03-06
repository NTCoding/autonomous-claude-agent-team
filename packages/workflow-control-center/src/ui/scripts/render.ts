export function $(selector: string): HTMLElement | null {
  return document.querySelector(selector)
}

export function html(strings: TemplateStringsArray, ...values: Array<unknown>): string {
  return strings.reduce((result, str, i) => result + str + String(values[i] ?? ''), '')
}

export function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  const hours = Math.floor(ms / 3600000)
  const mins = Math.round((ms % 3600000) / 60000)
  return `${hours}h ${mins}m`
}

export function formatTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function truncateId(id: string): string {
  return id.slice(0, 8)
}

export function stateColor(state: string): string {
  const colors: Record<string, string> = {
    SPAWN: 'var(--state-spawn)',
    PLANNING: 'var(--state-planning)',
    RESPAWN: 'var(--state-respawn)',
    DEVELOPING: 'var(--state-developing)',
    REVIEWING: 'var(--state-reviewing)',
    COMMITTING: 'var(--state-committing)',
    CR_REVIEW: 'var(--state-cr-review)',
    PR_CREATION: 'var(--state-pr-creation)',
    FEEDBACK: 'var(--state-feedback)',
    BLOCKED: 'var(--state-blocked)',
    COMPLETE: 'var(--state-complete)',
    idle: 'var(--state-idle)',
  }
  return colors[state] ?? 'var(--state-idle)'
}

export function agentColor(name: string): string {
  const colors = ['#8b5cf6', '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!
}

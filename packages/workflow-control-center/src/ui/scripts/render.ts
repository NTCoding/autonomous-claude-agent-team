export function html(strings: TemplateStringsArray, ...values: Array<unknown>): string {
  return strings.reduce((result, str, i) => result + str + String(values[i] ?? ''), '')
}

export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  return iso.slice(11, 19)
}

export function truncateId(id: string): string {
  return id.slice(0, 8)
}

export function formatTimestamp(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getUTCMonth()]
  const day = d.getUTCDate()
  const hours24 = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  const ampm = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutePart = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `${month} ${day}, ${hours12}${minutePart} ${ampm}`
}

export function formatTimeOnly(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const hours24 = d.getUTCHours()
  const minutes = d.getUTCMinutes()
  const ampm = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutePart = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`
  return `${hours12}${minutePart} ${ampm}`
}

const STATE_CSS_MAP: Record<string, string> = {
  SPAWN: 's-spawn', PLANNING: 's-plan', RESPAWN: 's-respawn',
  DEVELOPING: 's-dev', REVIEWING: 's-review', COMMITTING: 's-commit',
  CR_REVIEW: 's-cr', PR_CREATION: 's-pr', COMPLETE: 's-done',
  BLOCKED: 's-blocked', FEEDBACK: 's-feedback', idle: 's-idle',
}

const STATE_ABBREV_MAP: Record<string, string> = {
  SPAWN: 'SPAWN', PLANNING: 'PLAN', RESPAWN: 'RESP',
  DEVELOPING: 'DEV', REVIEWING: 'REV', COMMITTING: 'COM',
  CR_REVIEW: 'CR', PR_CREATION: 'PR', COMPLETE: 'DONE',
  BLOCKED: 'BLOCK', FEEDBACK: 'FDBK', idle: 'IDLE',
}

export function stateCssClass(state: string): string {
  return STATE_CSS_MAP[state] ?? 's-plan'
}

export function stateAbbrev(state: string): string {
  return STATE_ABBREV_MAP[state] ?? state.slice(0, 4)
}

export function stateBadge(state: string): string {
  return `<span class="ev-badge ${stateCssClass(state)}">${esc(stateAbbrev(state))}</span>`
}

export function stateColor(state: string): string {
  const colors: Record<string, string> = {
    SPAWN: '#9b59b6', PLANNING: '#95a5a6', RESPAWN: '#1abc9c',
    DEVELOPING: '#3498db', REVIEWING: '#e67e22', COMMITTING: '#2ecc71',
    CR_REVIEW: '#e91e63', PR_CREATION: '#f39c12', COMPLETE: '#27ae60',
    BLOCKED: '#c0392b', FEEDBACK: '#1abc9c', idle: '#95a5a6',
  }
  return colors[state] ?? '#95a5a6'
}

export function agentColor(name: string): string {
  return name === 'developer' ? '#3498db' : '#e67e22'
}

import type { StateName } from './workflow-state.js'

export function getProcedurePath(state: StateName, pluginRoot: string): string {
  const filename = state.toLowerCase().replace(/_/g, '-')
  return `${pluginRoot}/states/${filename}.md`
}

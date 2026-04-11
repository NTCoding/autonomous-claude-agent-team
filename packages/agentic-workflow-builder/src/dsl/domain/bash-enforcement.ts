import type { PreconditionResult } from './result.js'
import { pass, fail } from './result.js'
import type { BashForbiddenConfig } from './types.js'

function buildCommandPattern(command: string): RegExp {
  const parts = command.trim().split(/\s+/)
  const escapedParts = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const patternBody = escapedParts.join('\\s+')
  return new RegExp(`(?:^|\\s|&&|;)${patternBody}(?:\\s|$|-|;|&)`)
}

export function checkBashCommand(
  command: string,
  forbidden: BashForbiddenConfig,
  stateExemptions: readonly string[],
): PreconditionResult {
  for (const flag of forbidden.flags ?? []) {
    if (command.includes(flag)) {
      return fail(`Forbidden flag '${flag}' in command.`)
    }
  }

  for (const cmd of forbidden.commands) {
    const pattern = buildCommandPattern(cmd)
    if (!pattern.test(command)) {
      continue
    }
    if (stateExemptions.some((exemption) => command.includes(exemption))) {
      continue
    }
    return fail(`Forbidden command '${cmd}'.`)
  }

  return pass()
}

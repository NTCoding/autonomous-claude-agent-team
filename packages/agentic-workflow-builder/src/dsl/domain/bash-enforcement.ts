import type { PreconditionResult } from './result.js'
import { pass, fail } from './result.js'
import type { BashForbiddenConfig } from './types.js'

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

  for (const pattern of forbidden.patterns) {
    if (!pattern.test(command)) {
      continue
    }
    if (stateExemptions.some((exemption) => command.includes(exemption))) {
      continue
    }
    return fail('Command matches forbidden bash pattern.')
  }

  return pass()
}

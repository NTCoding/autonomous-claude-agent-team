export const SEPARATOR = '----------------------------------------------------------------'

export function formatBlock(title: string, body: string): string {
  return `${title}\n${SEPARATOR}\n${body}`
}

export function formatTransitionSuccess(
  title: string,
  procedureContent: string,
  expectedPrefix: string,
): string {
  return formatBlock(title, `${procedureContent}\n\nNext message MUST begin with: ${expectedPrefix}`)
}

export function formatTransitionError(
  to: string,
  reason: string,
  currentProcedure: string,
  expectedPrefix: string,
): string {
  return formatBlock(
    `Cannot transition to ${to}`,
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.\n\n${currentProcedure}\n\nNext message MUST begin with: ${expectedPrefix}`,
  )
}

export function formatIllegalTransitionError(
  reason: string,
  currentProcedure: string,
  expectedPrefix: string,
): string {
  return formatBlock(
    'Illegal transition',
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.\n\n${currentProcedure}\n\nNext message MUST begin with: ${expectedPrefix}`,
  )
}

export function formatOperationGateError(op: string, reason: string, expectedPrefix: string): string {
  return formatBlock(`Cannot ${op}`, `${reason}\n\nNext message MUST begin with: ${expectedPrefix}`)
}

export function formatOperationSuccess(op: string, body: string, expectedPrefix: string): string {
  return formatBlock(op, `${body}\n\nNext message MUST begin with: ${expectedPrefix}`)
}

export function formatInitSuccess(procedureContent: string, expectedPrefix: string): string {
  return formatBlock('Feature team initialized', `${procedureContent}\n\nNext message MUST begin with: ${expectedPrefix}`)
}

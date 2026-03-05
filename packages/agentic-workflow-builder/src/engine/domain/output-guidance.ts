export const SEPARATOR = '----------------------------------------------------------------'

export function formatBlock(title: string, body: string): string {
  return `${title}\n${SEPARATOR}\n${body}`
}

export function formatTransitionSuccess(
  title: string,
  procedureContent: string,
): string {
  return formatBlock(title, procedureContent)
}

export function formatTransitionError(
  to: string,
  reason: string,
  currentProcedure: string,
): string {
  return formatBlock(
    `Cannot transition to ${to}`,
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.\n\n${currentProcedure}`,
  )
}

export function formatIllegalTransitionError(
  reason: string,
  currentProcedure: string,
): string {
  return formatBlock(
    'Illegal transition',
    `${reason}\n\nYou are still in the current state. Complete the checklist before transitioning.\n\n${currentProcedure}`,
  )
}

export function formatOperationGateError(op: string, reason: string): string {
  return formatBlock(`Cannot ${op}`, reason)
}

export function formatOperationSuccess(op: string, body: string): string {
  return formatBlock(op, body)
}

export function formatInitSuccess(procedureContent: string): string {
  return formatBlock('Feature team initialized', procedureContent)
}

export function extractField(fieldName: string): (toolInput: Record<string, unknown>) => string {
  return (toolInput) => {
    const value = toolInput[fieldName]
    if (value === undefined || value === null) {
      return ''
    }
    if (typeof value !== 'string') {
      throw new Error(`Expected '${fieldName}' to be a string, got ${typeof value}`)
    }
    return value
  }
}

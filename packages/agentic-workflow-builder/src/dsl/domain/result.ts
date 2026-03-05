export type PreconditionResult = { readonly pass: true } | { readonly pass: false; readonly reason: string }

export const pass = (): PreconditionResult => ({ pass: true })

export const fail = (reason: string): PreconditionResult => ({ pass: false, reason })

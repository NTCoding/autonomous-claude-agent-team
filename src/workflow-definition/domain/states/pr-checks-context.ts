import { z } from 'zod'

const PrChecksContextSchema = z.object({
  prChecksPass: z.boolean(),
})

export function hasPassingPrChecks(ctx: object): boolean {
  const parsed = PrChecksContextSchema.safeParse(ctx)
  if (!parsed.success) return false
  return parsed.data.prChecksPass
}

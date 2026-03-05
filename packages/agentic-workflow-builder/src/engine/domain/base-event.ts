import { z } from 'zod'

export const BaseEventSchema = z.object({
  type: z.string(),
  at: z.string(),
})

export type BaseEvent = z.infer<typeof BaseEventSchema>

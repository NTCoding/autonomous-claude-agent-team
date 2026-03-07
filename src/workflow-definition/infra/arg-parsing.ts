import { z } from 'zod'

export const parseNumber = (v: unknown): number => z.number().parse(v)
export const parseString = (v: unknown): string => z.string().parse(v)
export const parseStringArray = (v: unknown): readonly string[] =>
  z.array(z.string()).readonly().parse(v)

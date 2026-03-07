import type { ZodType } from 'zod'

export type ArgResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

export type ArgParser<T> = {
  readonly parse: (args: readonly string[], position: number, commandName: string) => ArgResult<T>
  readonly optional: () => ArgParser<T | undefined>
}

function makeOptional<T>(parser: ArgParser<T>): ArgParser<T | undefined> {
  return {
    parse: (args, position, commandName) => {
      const raw = args[position]
      if (raw === undefined) {
        return { ok: true, value: undefined }
      }
      return parser.parse(args, position, commandName)
    },
    optional: () => makeOptional(parser),
  }
}

export const arg = {
  number: (name: string): ArgParser<number> => ({
    parse: (args, position, commandName) => {
      const raw = args[position]
      if (raw === undefined) {
        return { ok: false, message: `${commandName}: missing required argument <${name}>` }
      }
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed)) {
        return { ok: false, message: `${commandName}: not a valid number: '${raw}'` }
      }
      return { ok: true, value: parsed }
    },
    optional: function () {
      return makeOptional(this)
    },
  }),

  string: (name: string): ArgParser<string> => ({
    parse: (args, position, commandName) => {
      const raw = args[position]
      if (raw === undefined) {
        return { ok: false, message: `${commandName}: missing required argument <${name}>` }
      }
      return { ok: true, value: raw }
    },
    optional: function () {
      return makeOptional(this)
    },
  }),

  state: <T extends string>(name: string, schema: ZodType<T>): ArgParser<T> => ({
    parse: (args, position, commandName) => {
      const raw = args[position]
      if (raw === undefined) {
        return { ok: false, message: `${commandName}: missing required argument <${name}>` }
      }
      const result = schema.safeParse(raw)
      if (!result.success) {
        return { ok: false, message: `${commandName}: invalid state '${raw}'` }
      }
      return { ok: true, value: result.data }
    },
    optional: function () {
      return makeOptional(this)
    },
  }),
}

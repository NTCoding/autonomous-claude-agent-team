import { readFileSync } from 'node:fs'

export function readStdinSync(): string {
  return readFileSync(0, 'utf-8')
}

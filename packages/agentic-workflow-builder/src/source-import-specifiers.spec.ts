import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url))
const RELATIVE_JS_SPECIFIER_PATTERN = /(['"])\.{1,2}\/[^'"\n]+\.js\1/

function collectRuntimeTsFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectRuntimeTsFiles(fullPath)
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      return [fullPath]
    }
    return []
  })
}

describe('runtime source import specifiers', () => {
  it('does not use relative .js specifiers in runtime TypeScript files', () => {
    const runtimeFiles = collectRuntimeTsFiles(SOURCE_ROOT)
    const offenders = runtimeFiles.flatMap((filePath) => {
      const fileText = readFileSync(filePath, 'utf8')
      return RELATIVE_JS_SPECIFIER_PATTERN.test(fileText) ? [filePath] : []
    })

    expect(offenders).toStrictEqual([])
  })
})

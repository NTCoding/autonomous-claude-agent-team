/* v8 ignore start */
import { readFileSync, appendFileSync } from 'node:fs'
import { createStore } from '../../event-store/index'
import type { ProcessDeps } from './workflow-cli'

export function createDefaultProcessDeps(): ProcessDeps {
  return {
    getEnv: (name) => process.env[name],
    exit: (code) => process.exit(code),
    writeStdout: (s) => { process.stdout.write(s) },
    writeStderr: (s) => { process.stderr.write(s) },
    getArgv: () => process.argv,
    readFile: (path) => readFileSync(path, 'utf8'),
    appendToFile: (path, content) => appendFileSync(path, content),
    buildStore: (dbPath) => createStore(dbPath),
  }
}
/* v8 ignore end */

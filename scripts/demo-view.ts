import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createStore } from '../src/workflow-event-store/sqlite-event-store.js'
import { generateViewerHtml } from '../src/workflow-analysis/workflow-viewer-html.js'

const dbPath = join(tmpdir(), 'workflow-demo.db')
const htmlPath = join(tmpdir(), 'workflow-viewer-demo.html')

writeFileSync(htmlPath, generateViewerHtml(createStore(dbPath)))
execSync(`open ${htmlPath}`)
process.stdout.write(`Opened: ${htmlPath}\n`)

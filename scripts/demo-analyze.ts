import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore } from '@ntcoding/agentic-workflow-builder/event-store'
import {
  computeSessionSummary,
  computeCrossSessionSummary,
  formatSessionSummary,
  formatCrossSessionSummary,
} from '../src/workflow-analysis/workflow-analytics.js'

const store = createStore(join(tmpdir(), 'workflow-demo.db'))

process.stdout.write(formatSessionSummary(computeSessionSummary(store, 'session-completed')))
process.stdout.write('\n\n')
process.stdout.write(formatCrossSessionSummary(computeCrossSessionSummary(store)))
process.stdout.write('\n')

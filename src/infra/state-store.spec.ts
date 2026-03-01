import { writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readState, writeState, stateFileExists } from './state-store.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLUGIN_TEST_DIR = join(import.meta.dirname, '../../.claude/plugins/autonomous-claude-agent-team')
const testPath = join(PLUGIN_TEST_DIR, 'test-state-store-spec.json')

beforeAll(() => { mkdirSync(PLUGIN_TEST_DIR, { recursive: true }) })

afterEach(() => {
  if (existsSync(testPath)) unlinkSync(testPath)
  if (existsSync(`${testPath}.tmp`)) unlinkSync(`${testPath}.tmp`)
})

describe('readState', () => {
  it('parses valid state file', () => {
    writeFileSync(testPath, JSON.stringify(INITIAL_STATE), 'utf-8')
    expect(readState(testPath)).toStrictEqual(INITIAL_STATE)
  })

  it('throws when file does not exist', () => {
    expect(() => readState(join(PLUGIN_TEST_DIR, 'nonexistent-state-abc123.json'))).toThrow('Cannot read state file')
  })

  it('throws when file contains invalid JSON', () => {
    writeFileSync(testPath, 'not { valid json', 'utf-8')
    expect(() => readState(testPath)).toThrow('Cannot parse state file')
  })

  it('throws when JSON does not match schema', () => {
    writeFileSync(testPath, JSON.stringify({ invalid: true }), 'utf-8')
    expect(() => readState(testPath)).toThrow('Invalid state file')
  })
})

describe('writeState', () => {
  it('creates the state file', () => {
    writeState(testPath, INITIAL_STATE)
    expect(existsSync(testPath)).toStrictEqual(true)
  })

  it('round-trips state without data loss', () => {
    writeState(testPath, INITIAL_STATE)
    expect(readState(testPath)).toStrictEqual(INITIAL_STATE)
  })
})

describe('stateFileExists', () => {
  it('returns false when file does not exist', () => {
    expect(stateFileExists(join(PLUGIN_TEST_DIR, 'nonexistent-xyz-987.json'))).toStrictEqual(false)
  })

  it('returns true when file exists', () => {
    writeFileSync(testPath, JSON.stringify(INITIAL_STATE), 'utf-8')
    expect(stateFileExists(testPath)).toStrictEqual(true)
  })
})

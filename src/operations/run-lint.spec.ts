import { runLint } from './run-lint.js'
import type { RunLintDeps } from './run-lint.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const DEVELOPING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  iteration: 1,
}

function makeDeps(
  opts: {
    stateToReturn?: WorkflowState
    stateExists?: boolean
    eslintPasses?: boolean
    filesExist?: boolean
    captureState?: (state: WorkflowState) => void
  } = {},
): RunLintDeps {
  const {
    stateToReturn = DEVELOPING_STATE,
    stateExists = true,
    eslintPasses = true,
    filesExist = true,
    captureState,
  } = opts
  return {
    readState: () => stateToReturn,
    writeState: (_path, state) => captureState?.(state),
    stateFileExists: () => stateExists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    now: () => '2026-01-01T00:00:00Z',
    runEslintOnFiles: () => eslintPasses,
    fileExists: () => filesExist,
    getPluginRoot: () => '/plugin',
  }
}

describe('runLint — file filtering', () => {
  it('records lint as passed when no TypeScript files exist', () => {
    const result = runLint('s1', ['README.md', 'package.json'], makeDeps())
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('No TypeScript files to lint')
  })

  it('skips non-existent TypeScript files', () => {
    const deps = makeDeps({ filesExist: false })
    const result = runLint('s1', ['src/foo.ts'], deps)
    expect(result.output).toContain('No TypeScript files to lint')
  })
})

describe('runLint — lint pass', () => {
  it('returns success output when lint passes', () => {
    const result = runLint('s1', ['src/foo.ts'], makeDeps({ eslintPasses: true }))
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('Lint passed')
  })

  it('records lintRanIteration and lintedFiles in state on pass', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps({ captureState: (s) => captured.push(s) })
    runLint('s1', ['src/foo.ts'], deps)
    expect(captured[0]?.lintRanIteration).toStrictEqual(1)
    expect(captured[0]?.lintedFiles).toContain('src/foo.ts')
  })
})

describe('runLint — lint fail', () => {
  it('returns failure output and EXIT_BLOCK when lint fails', () => {
    const result = runLint('s1', ['src/foo.ts'], makeDeps({ eslintPasses: false }))
    expect(result.exitCode).toStrictEqual(2)
    expect(result.output).toContain('Lint failed')
  })

  it('does not update state when lint fails', () => {
    const captured: WorkflowState[] = []
    const deps = makeDeps({ eslintPasses: false, captureState: (s) => captured.push(s) })
    runLint('s1', ['src/foo.ts'], deps)
    expect(captured).toHaveLength(0)
  })
})

describe('runLint — no state file', () => {
  it('runs lint and returns success even without a state file', () => {
    const deps = makeDeps({ stateExists: false })
    const result = runLint('s1', ['src/foo.ts'], deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toContain('Lint passed')
  })
})

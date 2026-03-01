import { runInjectStateProcedure } from './inject-state-procedure.js'
import type { InjectStateProcedureDeps } from './inject-state-procedure.js'
import type { PreToolUseInput } from '../infra/hook-io.js'
import type { WorkflowState } from '../domain/workflow-state.js'
import { INITIAL_STATE } from '../domain/workflow-state.js'

const PLANNING_STATE: WorkflowState = { ...INITIAL_STATE, state: 'PLANNING' }
const DEVELOPING_STATE: WorkflowState = {
  ...INITIAL_STATE,
  state: 'DEVELOPING',
  commitsBlocked: true,
  currentIterationTask: 'Iteration 1: Build API',
}

function makeHookInput(): PreToolUseInput {
  return {
    session_id: 'sess1',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/project',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: {},
    tool_use_id: 'tool-1',
  }
}

function makeDeps(
  stateToReturn: WorkflowState,
  exists = true,
  procedureContent = 'Procedure steps here',
): InjectStateProcedureDeps {
  return {
    readState: () => stateToReturn,
    stateFileExists: () => exists,
    getStateFilePath: (id) => `/test/state-${id}.json`,
    readFile: () => procedureContent,
    getPluginRoot: () => '/plugin',
  }
}

describe('runInjectStateProcedure — no state file', () => {
  it('returns empty output when no state file', () => {
    const deps = makeDeps(PLANNING_STATE, false)
    const result = runInjectStateProcedure('s1', makeHookInput(), deps)
    expect(result.exitCode).toStrictEqual(0)
    expect(result.output).toStrictEqual('')
  })
})

describe('runInjectStateProcedure — context injection', () => {
  it('injects state name in context', () => {
    const deps = makeDeps(PLANNING_STATE)
    const result = runInjectStateProcedure('s1', makeHookInput(), deps)
    expect(result.output).toContain('PLANNING')
    expect(result.output).toContain('additionalContext')
  })

  it('includes current iteration task when set', () => {
    const deps = makeDeps(DEVELOPING_STATE)
    const result = runInjectStateProcedure('s1', makeHookInput(), deps)
    expect(result.output).toContain('Iteration 1: Build API')
  })

  it('reads procedure file for current state', () => {
    const readPaths: string[] = []
    const deps = makeDeps(PLANNING_STATE, true, 'Planning procedure')
    const depsWithSpy: InjectStateProcedureDeps = {
      ...deps,
      readFile: (path) => { readPaths.push(path); return 'Planning procedure' },
    }
    runInjectStateProcedure('s1', makeHookInput(), depsWithSpy)
    expect(readPaths[0]).toContain('planning')
  })
})

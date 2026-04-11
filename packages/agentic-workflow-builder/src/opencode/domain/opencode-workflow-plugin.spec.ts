import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { z } from 'zod'
import type { Config as OpenCodeConfig, Hooks } from '@opencode-ai/plugin'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import { createOpenCodeWorkflowPlugin } from './opencode-workflow-plugin.js'
import type { OpenCodeWorkflowPluginConfig } from './opencode-workflow-plugin.js'
import { createStore } from '../../event-store/index.js'
import type {
  BaseWorkflowState,
  RehydratableWorkflow,
  WorkflowDefinition,
} from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import type { PlatformContext, CustomPreToolUseGate, RouteMap } from '../../cli/index.js'
import { pass } from '../../dsl/index.js'

type TestStateName = 'planning'
type TestState = BaseWorkflowState<TestStateName> & { readonly transcriptPath?: string }
type TestDeps = Record<string, never>
type TestWorkflow = RehydratableWorkflow<TestState>

function createMockWorkflow(initialState: TestState = { currentStateMachineState: 'planning' }): TestWorkflow {
  const pendingEvents: BaseEvent[] = []
  let transcriptPath = initialState.transcriptPath
  return {
    getState: () => ({ currentStateMachineState: 'planning', transcriptPath }),
    appendEvent: (event) => { pendingEvents.push(event) },
    getPendingEvents: () => pendingEvents as readonly BaseEvent[],
    startSession: (nextTranscriptPath) => {
      transcriptPath = nextTranscriptPath
      pendingEvents.push({
        type: 'session-started',
        at: new Date().toISOString(),
        transcriptPath: nextTranscriptPath,
      })
    },
    getTranscriptPath: () => {
      if (transcriptPath === undefined) {
        throw new Error('Transcript path not set. Session has not been started.')
      }
      return transcriptPath
    },
    registerAgent: () => pass(),
    handleTeammateIdle: () => pass(),
  }
}

function createMockWorkflowDefinition(): WorkflowDefinition<TestWorkflow, TestState, TestDeps, TestStateName> {
  return {
    fold: (state, event) => {
      if (event.type === 'session-started' && typeof event['transcriptPath'] === 'string') {
        return { ...state, transcriptPath: event['transcriptPath'] }
      }
      return state
    },
    buildWorkflow: (state) => createMockWorkflow(state),
    stateSchema: z.literal('planning'),
    initialState: () => ({ currentStateMachineState: 'planning' }),
    getRegistry: () => ({
      planning: {
        emoji: '📋',
        agentInstructions: 'states/planning.md',
        canTransitionTo: [],
        allowedWorkflowOperations: [],
      },
    }),
    buildTransitionContext: (state, from, to) => ({
      state,
      gitInfo: {
        currentBranch: 'main',
        workingTreeClean: true,
        headCommit: 'abc123',
        changedFilesVsDefault: [],
        hasCommitsVsDefault: false,
      },
      from,
      to,
    }),
  }
}

type ToolExecuteBeforeHook = NonNullable<Hooks['tool.execute.before']>
type HookInput = Parameters<ToolExecuteBeforeHook>[0]
type HookOutput = Parameters<ToolExecuteBeforeHook>[1]

let pluginRoot: string

type TestConfigBase = Omit<OpenCodeWorkflowPluginConfig<TestWorkflow, TestState, TestDeps, TestStateName>, 'databasePath'>

function createBaseConfig(
  overrides?: Partial<TestConfigBase>,
): TestConfigBase {
  return {
    workflowDefinition: createMockWorkflowDefinition(),
    bashForbidden: { commands: ['rm'] },
    isWriteAllowed: () => true,
    buildWorkflowDeps: (platform) => {
      platform.getPluginRoot()
      platform.now()
      platform.getSessionId()
      const deps: TestDeps = {}
      return deps
    },
    pluginRoot,
    ...overrides,
  }
}

function createConfig(
  overrides?: Partial<TestConfigBase>,
  databasePath: string = '/nonexistent-opencode.db',
): OpenCodeWorkflowPluginConfig<TestWorkflow, TestState, TestDeps, TestStateName> {
  return { ...createBaseConfig(overrides), databasePath }
}

async function invokeHook(
  config: OpenCodeWorkflowPluginConfig<TestWorkflow, TestState, TestDeps, TestStateName>,
  hookInput: HookInput,
  hookOutput: HookOutput = { args: {} },
): Promise<void> {
  const plugin = createOpenCodeWorkflowPlugin(config)
  const hooks = await plugin()
  await hooks['tool.execute.before']!(hookInput, hookOutput)
}

function createToolContext(sessionID: string): ToolContext {
  return {
    sessionID,
    messageID: 'msg-1',
    agent: 'general',
    directory: pluginRoot,
    worktree: pluginRoot,
    abort: new AbortController().signal,
    metadata: () => {
      return
    },
    ask: async () => {
      return
    },
  }
}

function hasZodV4SchemaDef(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const zodValue = value['_zod']
  if (typeof zodValue !== 'object' || zodValue === null) {
    return false
  }

  return 'def' in zodValue
}

function getWorkflowTool(hooks: Hooks): NonNullable<NonNullable<Hooks['tool']>['workflow']> {
  const workflowTool = hooks.tool?.['workflow']
  if (workflowTool === undefined) {
    throw new Error('Expected workflow tool to be defined')
  }
  return workflowTool
}

beforeEach(() => {
  pluginRoot = mkdtempSync(join(tmpdir(), 'opencode-plugin-spec-'))
  mkdirSync(join(pluginRoot, 'states'))
  writeFileSync(join(pluginRoot, 'states', 'planning.md'), '- [ ] Planning procedure')
  delete process.env['OPENCODE_DB']
})

afterEach(() => {
  rmSync(pluginRoot, { recursive: true })
  vi.unstubAllEnvs()
})

describe('createOpenCodeWorkflowPlugin — plugin factory', () => {
  it('returns a function that resolves to a hooks object', async () => {
    const plugin = createOpenCodeWorkflowPlugin(createConfig())
    const hooks = await plugin()
    expect(hooks['tool.execute.before']).toBeTypeOf('function')
  })
})

describe('createOpenCodeWorkflowPlugin — tool.execute.before', () => {
  it('allows non-write non-bash tools', async () => {
    await expect(
      invokeHook(createConfig(), { tool: 'Read', sessionID: 'session-1', callID: 'c1' }),
    ).resolves.toBeUndefined()
  })

  it('blocks forbidden bash commands', async () => {
    await expect(
      invokeHook(
        createConfig(),
        { tool: 'Bash', sessionID: 'session-2', callID: 'c2' },
        { args: { command: 'rm -rf /' } },
      ),
    ).rejects.toThrow()
  })

  it('applies custom gates when configured', async () => {
    const gate: CustomPreToolUseGate<TestWorkflow, TestState, TestStateName> = {
      name: 'deny-all',
      check: () => 'custom gate blocked',
    }
    await expect(
      invokeHook(
        createConfig({ customGates: [gate] }),
        { tool: 'Read', sessionID: 'gate-session', callID: 'c1' },
      ),
    ).rejects.toThrow()
  })

  it('auto-initializes session on first call', async () => {
    await expect(
      invokeHook(createConfig(), { tool: 'Read', sessionID: 'fresh-session', callID: 'c1' }),
    ).resolves.toBeUndefined()
  })

  it('skips session init on subsequent calls with the same session', async () => {
    const plugin = createOpenCodeWorkflowPlugin(createConfig())
    const hooks = await plugin()
    const hook = hooks['tool.execute.before']!
    const input: HookInput = { tool: 'Read', sessionID: 'reused-session', callID: 'c1' }

    await hook(input, { args: {} })
    await expect(hook(input, { args: {} })).resolves.toBeUndefined()
  })
})

describe('createOpenCodeWorkflowPlugin — platform context', () => {
  it('passes pluginRoot, now, and sessionId to buildWorkflowDeps', async () => {
    let capturedPlatform: PlatformContext | undefined

    await invokeHook(
      createConfig({
        buildWorkflowDeps: (platform) => {
          capturedPlatform = platform
          const deps: TestDeps = {}
          return deps
        },
      }),
      { tool: 'Read', sessionID: 'ctx-session', callID: 'c1' },
    )

    expect(capturedPlatform?.getPluginRoot()).toBe(pluginRoot)
    expect(typeof capturedPlatform?.now()).toBe('string')
    expect(capturedPlatform?.getSessionId()).toBe('ctx-session')
  })
})

describe('createOpenCodeWorkflowPlugin — routes (workflow tool)', () => {
  const routes: RouteMap<TestWorkflow, TestState> = {
    init: { type: 'session-start' },
    'record-issue': {
      type: 'transaction',
      handler: () => pass(),
    },
  }

  function withRoutes(overrides?: Partial<TestConfigBase>) {
    return createConfig({ routes, ...overrides })
  }

  it('hooks.tool.workflow is defined when routes are configured', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    expect(workflowTool).toBeDefined()
    expect(workflowTool.description).toBeTypeOf('string')
    expect(workflowTool.execute).toBeTypeOf('function')
  })

  it('hooks.tool is undefined when routes are omitted', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig())()
    expect(hooks.tool).toBeUndefined()
  })

  it('hooks.config is undefined when routes are omitted', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig())()
    expect(hooks.config).toBeUndefined()
  })

  it('workflow init creates session and returns procedure content with translation note', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    const output = await workflowTool.execute(
      { operation: 'init' },
      createToolContext('routes-init-session'),
    )
    expect(output).toContain('OpenCode')
    expect(output).toContain('Planning procedure')
  })

  it('workflow tool returns error output for unknown operation', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    const output = await workflowTool.execute(
      { operation: 'unknown-op' },
      createToolContext('routes-unknown-session'),
    )
    expect(output).toContain('unknown-op')
  })

  it('workflow tool forwards args to the runner', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    const output = await workflowTool.execute(
      { operation: 'init', args: [] },
      createToolContext('routes-args-session'),
    )
    expect(output).toContain('Planning procedure')
  })

  it('workflow tool treats empty operation as unknown command', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    const output = await workflowTool.execute(
      { operation: '' },
      createToolContext('routes-no-op-session'),
    )
    expect(output).toContain('')
  })

  it('workflow tool forwards customGates to the runner', async () => {
    const gate: CustomPreToolUseGate<TestWorkflow, TestState, TestStateName> = {
      name: 'allow-all',
      check: () => true,
    }
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes({ customGates: [gate] }))()
    const workflowTool = getWorkflowTool(hooks)
    const output = await workflowTool.execute(
      { operation: 'init' },
      createToolContext('routes-gates-session'),
    )
    expect(output).toContain('Planning procedure')
  })

  it('workflow tool args use SDK-compatible zod schema objects', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    const operationSchema = workflowTool.args['operation']
    const argsSchema = workflowTool.args['args']

    expect(hasZodV4SchemaDef(operationSchema)).toBe(true)
    expect(hasZodV4SchemaDef(argsSchema)).toBe(true)
  })

  it('tool.execute.before allows all tools without enforcement when no session exists (routes mode)', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    await expect(
      hooks['tool.execute.before']!(
        { tool: 'Bash', sessionID: 'no-session-yet', callID: 'c1' },
        { args: { command: 'rm -rf /' } },
      ),
    ).resolves.toBeUndefined()
  })

  it('tool.execute.before does not enforce when session has events but no session-started event', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const rawStore = createStore(join(pluginRoot, 'workflow.db'))
    rawStore.appendEvents('events-only-session', [{
      type: 'identity-verified',
      at: '2026-01-01T00:00:00.000Z',
      status: 'never-spoken',
      transcriptPath: '/tmp/non-session-path.db',
    }])

    await expect(
      hooks['tool.execute.before']!(
        { tool: 'Bash', sessionID: 'events-only-session', callID: 'c1' },
        { args: { command: 'rm -rf /' } },
      ),
    ).resolves.toBeUndefined()
  })

  it('tool.execute.before enforces after session is created by workflow init (routes mode)', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const workflowTool = getWorkflowTool(hooks)
    await workflowTool.execute(
      { operation: 'init' },
      createToolContext('enforced-session'),
    )

    await expect(
      hooks['tool.execute.before']!(
        { tool: 'Bash', sessionID: 'enforced-session', callID: 'c2' },
        { args: { command: 'rm -rf /' } },
      ),
    ).rejects.toThrow()
  })

  it('workflow init stores OpenCode DB path and reuses it for identity verification', async () => {
    const databasePath = join(pluginRoot, 'opencode-transcript.db')
    const hooks = await createOpenCodeWorkflowPlugin(createConfig({ routes }, databasePath))()
    const workflowTool = getWorkflowTool(hooks)

    await expect(
      workflowTool.execute(
        { operation: 'init' },
        createToolContext('db-path-session'),
      ),
    ).resolves.toContain('Planning procedure')

    await expect(
      workflowTool.execute(
        { operation: 'record-issue' },
        createToolContext('db-path-session'),
      ),
    ).resolves.toContain('record-issue')

    const store = createStore(join(pluginRoot, 'workflow.db'))
    const events = store.readEvents('db-path-session')
    const sessionStarted = events.find((event) => event.type === 'session-started')
    const identityVerified = [...events].reverse().find((event) => event.type === 'identity-verified')

    expect(sessionStarted?.['transcriptPath']).toBe(databasePath)
    expect(identityVerified?.['transcriptPath']).toBe(databasePath)
  })
})

describe('createOpenCodeWorkflowPlugin — commandDirectories', () => {
  const routes: RouteMap<TestWorkflow, TestState> = {
    init: { type: 'session-start' },
  }
  let commandDir: string

  beforeEach(() => {
    commandDir = mkdtempSync(join(tmpdir(), 'opencode-cmds-'))
  })

  afterEach(() => {
    rmSync(commandDir, { recursive: true })
  })

  it('registers commands from provided directories with translation note prepended', async () => {
    writeFileSync(join(commandDir, 'start-implementation.md'), '## Step 3\n\n/dev-workflow-v2:workflow init')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: [commandDir] }),
    )()
    const openCodeConfig: OpenCodeConfig = {}
    await hooks.config?.(openCodeConfig)

    const command = openCodeConfig.command?.['start-implementation']
    expect(command).toBeDefined()
    expect(command?.template).toContain('OpenCode')
    expect(command?.template).toContain('/dev-workflow-v2:workflow init')
    expect('content' in (command ?? {})).toBe(false)
  })

  it('ignores non-.md files in command directories', async () => {
    writeFileSync(join(commandDir, 'readme.txt'), 'ignored')
    writeFileSync(join(commandDir, 'cmd.md'), '# Command')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: [commandDir] }),
    )()
    const openCodeConfig: OpenCodeConfig = {}
    await hooks.config?.(openCodeConfig)

    expect(openCodeConfig.command?.['readme']).toBeUndefined()
    expect(openCodeConfig.command?.['cmd']).toBeDefined()
  })

  it('merges commands from multiple directories', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'opencode-cmds2-'))
    try {
      writeFileSync(join(commandDir, 'cmd-a.md'), '# A')
      writeFileSync(join(dir2, 'cmd-b.md'), '# B')
      const hooks = await createOpenCodeWorkflowPlugin(
        createConfig({ routes, commandDirectories: [commandDir, dir2] }),
      )()
      const openCodeConfig: OpenCodeConfig = {}
      await hooks.config?.(openCodeConfig)

      expect(openCodeConfig.command?.['cmd-a']).toBeDefined()
      expect(openCodeConfig.command?.['cmd-b']).toBeDefined()
    } finally {
      rmSync(dir2, { recursive: true })
    }
  })

  it('keeps the first command when duplicate command names exist across directories', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'opencode-cmds3-'))
    try {
      writeFileSync(join(commandDir, 'choose-next-task.md'), '# First')
      writeFileSync(join(dir2, 'choose-next-task.md'), '# Second')
      const hooks = await createOpenCodeWorkflowPlugin(
        createConfig({ routes, commandDirectories: [commandDir, dir2] }),
      )()
      const openCodeConfig: OpenCodeConfig = {}
      await hooks.config?.(openCodeConfig)

      expect(openCodeConfig.command?.['choose-next-task']?.template).toContain('# First')
      expect(openCodeConfig.command?.['choose-next-task']?.template).not.toContain('# Second')
    } finally {
      rmSync(dir2, { recursive: true })
    }
  })

  it('hooks.config is undefined when commandDirectories is not provided', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig({ routes }))()
    expect(hooks.config).toBeUndefined()
  })

  it('hooks.config is undefined when provided directories contain no .md files', async () => {
    // commandDir exists but is empty
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: [commandDir] }),
    )()
    expect(hooks.config).toBeUndefined()
  })

  it('skips non-existent directories without error', async () => {
    writeFileSync(join(commandDir, 'cmd.md'), '# Command')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: ['/nonexistent-dir-xyz', commandDir] }),
    )()
    const openCodeConfig: OpenCodeConfig = {}
    await hooks.config?.(openCodeConfig)

    expect(openCodeConfig.command?.['cmd']).toBeDefined()
  })

  it('applies commandPrefix when registering command keys', async () => {
    writeFileSync(join(commandDir, 'choose-next-task.md'), '# Choose')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({
        routes,
        commandDirectories: [commandDir],
        commandPrefix: 'dev-workflow-v2:',
      }),
    )()
    const openCodeConfig: OpenCodeConfig = {}
    await hooks.config?.(openCodeConfig)

    expect(openCodeConfig.command?.['dev-workflow-v2:choose-next-task']).toBeDefined()
    expect(openCodeConfig.command?.['choose-next-task']).toBeUndefined()
  })

  it('does not overwrite existing config command on key collision', async () => {
    writeFileSync(join(commandDir, 'choose-next-task.md'), '# New Template')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({
        routes,
        commandDirectories: [commandDir],
        commandPrefix: 'dev-workflow-v2:',
      }),
    )()
    const openCodeConfig: OpenCodeConfig = {
      command: {
        'dev-workflow-v2:choose-next-task': {
          template: '# Existing Template',
          description: 'existing command',
        },
      },
    }

    await hooks.config?.(openCodeConfig)

    expect(openCodeConfig.command?.['dev-workflow-v2:choose-next-task']?.template).toBe('# Existing Template')
  })
})

describe('createOpenCodeWorkflowPlugin — database path resolution', () => {
  it('uses the provided databasePath', async () => {
    await expect(
      invokeHook(createConfig({}, '/explicit/custom.db'), {
        tool: 'Read',
        sessionID: 'explicit-db-session',
        callID: 'c1',
      }),
    ).resolves.toBeUndefined()
  })

  it('uses OPENCODE_DB env var when databasePath is not configured', async () => {
    vi.stubEnv('OPENCODE_DB', '/env-opencode.db')
    await expect(
      invokeHook(createBaseConfig(), {
        tool: 'Read',
        sessionID: 'env-db-session',
        callID: 'c1',
      }),
    ).resolves.toBeUndefined()
  })

  it('falls back to XDG default path when neither config nor env var is set', async () => {
    await expect(
      invokeHook(createBaseConfig(), {
        tool: 'Read',
        sessionID: 'default-db-session',
        callID: 'c1',
      }),
    ).resolves.toBeUndefined()
  })
})

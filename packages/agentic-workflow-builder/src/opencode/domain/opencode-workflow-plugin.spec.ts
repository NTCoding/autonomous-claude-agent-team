import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { z } from 'zod'
import { createOpenCodeWorkflowPlugin } from './opencode-workflow-plugin.js'
import type { OpenCodeWorkflowPluginConfig } from './opencode-workflow-plugin.js'
import type {
  BaseWorkflowState,
  RehydratableWorkflow,
  WorkflowDefinition,
} from '../../engine/index.js'
import type { BaseEvent } from '../../engine/index.js'
import type { PlatformContext, CustomPreToolUseGate, RouteMap } from '../../cli/index.js'
import { pass } from '../../dsl/index.js'

type TestStateName = 'planning'
type TestState = BaseWorkflowState<TestStateName>
type TestDeps = Record<string, never>
type TestWorkflow = RehydratableWorkflow<TestState>

function createMockWorkflow(): TestWorkflow {
  const pendingEvents: BaseEvent[] = []
  return {
    getState: () => ({ currentStateMachineState: 'planning' }),
    appendEvent: (event) => { pendingEvents.push(event) },
    getPendingEvents: () => pendingEvents as readonly BaseEvent[],
    startSession: () => { pendingEvents.push({ type: 'session-started', at: new Date().toISOString() }) },
    getTranscriptPath: () => '/nonexistent-transcript.db',
    registerAgent: () => pass(),
    handleTeammateIdle: () => pass(),
  }
}

function createMockWorkflowDefinition(): WorkflowDefinition<TestWorkflow, TestState, TestDeps, TestStateName> {
  return {
    fold: (state) => state,
    buildWorkflow: () => createMockWorkflow(),
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
      prChecksPass: false,
      from,
      to,
    }),
  }
}

type HookInput = { tool: string; sessionID: string; callID: string }
type HookOutput = { args: Record<string, unknown> }

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
  }

  function withRoutes(overrides?: Partial<TestConfigBase>) {
    return createConfig({ routes, ...overrides })
  }

  it('hooks.tool.workflow is defined when routes are configured', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    expect(hooks.tool?.['workflow']).toBeDefined()
    expect(hooks.tool?.['workflow'].description).toBeTypeOf('string')
    expect(hooks.tool?.['workflow'].execute).toBeTypeOf('function')
  })

  it('hooks.tool is undefined when routes are omitted', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig())()
    expect(hooks.tool).toBeUndefined()
  })

  it('hooks.command is undefined when routes are omitted', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig())()
    expect(hooks.command).toBeUndefined()
  })

  it('workflow init creates session and returns procedure content with translation note', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const output = await hooks.tool!['workflow'].execute(
      { operation: 'init' },
      { sessionID: 'routes-init-session' },
    )
    expect(output).toContain('OpenCode')
    expect(output).toContain('Planning procedure')
  })

  it('workflow tool returns error output for unknown operation', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const output = await hooks.tool!['workflow'].execute(
      { operation: 'unknown-op' },
      { sessionID: 'routes-unknown-session' },
    )
    expect(output).toContain('unknown-op')
  })

  it('workflow tool forwards args to the runner', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const output = await hooks.tool!['workflow'].execute(
      { operation: 'init', args: [] },
      { sessionID: 'routes-args-session' },
    )
    expect(output).toContain('Planning procedure')
  })

  it('workflow tool treats missing operation as empty string (returns unknown command)', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    const output = await hooks.tool!['workflow'].execute({}, { sessionID: 'routes-no-op-session' })
    expect(output).toContain('')
  })

  it('workflow tool forwards customGates to the runner', async () => {
    const gate: CustomPreToolUseGate<TestWorkflow, TestState, TestStateName> = {
      name: 'allow-all',
      check: () => true,
    }
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes({ customGates: [gate] }))()
    const output = await hooks.tool!['workflow'].execute(
      { operation: 'init' },
      { sessionID: 'routes-gates-session' },
    )
    expect(output).toContain('Planning procedure')
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

  it('tool.execute.before enforces after session is created by workflow init (routes mode)', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(withRoutes())()
    await hooks.tool!['workflow'].execute({ operation: 'init' }, { sessionID: 'enforced-session' })

    await expect(
      hooks['tool.execute.before']!(
        { tool: 'Bash', sessionID: 'enforced-session', callID: 'c2' },
        { args: { command: 'rm -rf /' } },
      ),
    ).rejects.toThrow()
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
    expect(hooks.command?.['start-implementation']).toBeDefined()
    expect(hooks.command?.['start-implementation'].content).toContain('OpenCode')
    expect(hooks.command?.['start-implementation'].content).toContain('/dev-workflow-v2:workflow init')
  })

  it('ignores non-.md files in command directories', async () => {
    writeFileSync(join(commandDir, 'readme.txt'), 'ignored')
    writeFileSync(join(commandDir, 'cmd.md'), '# Command')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: [commandDir] }),
    )()
    expect(hooks.command?.['readme']).toBeUndefined()
    expect(hooks.command?.['cmd']).toBeDefined()
  })

  it('merges commands from multiple directories', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'opencode-cmds2-'))
    try {
      writeFileSync(join(commandDir, 'cmd-a.md'), '# A')
      writeFileSync(join(dir2, 'cmd-b.md'), '# B')
      const hooks = await createOpenCodeWorkflowPlugin(
        createConfig({ routes, commandDirectories: [commandDir, dir2] }),
      )()
      expect(hooks.command?.['cmd-a']).toBeDefined()
      expect(hooks.command?.['cmd-b']).toBeDefined()
    } finally {
      rmSync(dir2, { recursive: true })
    }
  })

  it('hooks.command is undefined when commandDirectories is not provided', async () => {
    const hooks = await createOpenCodeWorkflowPlugin(createConfig({ routes }))()
    expect(hooks.command).toBeUndefined()
  })

  it('hooks.command is undefined when provided directories contain no .md files', async () => {
    // commandDir exists but is empty
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: [commandDir] }),
    )()
    expect(hooks.command).toBeUndefined()
  })

  it('skips non-existent directories without error', async () => {
    writeFileSync(join(commandDir, 'cmd.md'), '# Command')
    const hooks = await createOpenCodeWorkflowPlugin(
      createConfig({ routes, commandDirectories: ['/nonexistent-dir-xyz', commandDir] }),
    )()
    expect(hooks.command?.['cmd']).toBeDefined()
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

import type { WorkflowEngine, EngineResult } from '@ntcoding/agentic-workflow-builder/engine'
import { BASH_FORBIDDEN, checkWriteAllowed } from '../index.js'
import type { Workflow, WorkflowDeps } from '../index.js'
import type { StateName, WorkflowOperation, WorkflowState } from '../domain/workflow-types.js'
import { WorkflowError } from '../../infra/workflow-error.js'

type Engine = WorkflowEngine<Workflow, WorkflowState, WorkflowDeps, StateName, WorkflowOperation>

export function preToolUseHandler(
  engine: Engine,
  sessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  transcriptPath: string | undefined,
): EngineResult {
  const filePath = resolveStringField(toolInput['file_path'])
    || resolveStringField(toolInput['path'])
    || resolveStringField(toolInput['pattern'])
  const command = resolveStringField(toolInput['command'])

  const pluginCheck = engine.transaction(sessionId, 'hook-check', (w) => {
    return w.checkPluginSourceRead(toolName, filePath, command)
  }, transcriptPath)
  if (pluginCheck.type === 'blocked') return pluginCheck

  const writeCheck = engine.checkWrite(sessionId, toolName, filePath, checkWriteAllowed, transcriptPath)
  if (writeCheck.type === 'blocked') return writeCheck

  return engine.checkBash(sessionId, toolName, command, BASH_FORBIDDEN, transcriptPath)
}

function resolveStringField(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  throw new WorkflowError(`Expected string or undefined. Got ${typeof value}: ${String(value)}`)
}

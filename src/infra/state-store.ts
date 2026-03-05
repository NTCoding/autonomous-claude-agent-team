import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import type { WorkflowState as WorkflowStateType } from '../workflow-definition/index.js'
import { WorkflowStateSchema } from '../workflow-definition/index.js'
import { WorkflowError } from './workflow-error.js'

export function readState(stateFilePath: string): WorkflowStateType {
  const raw = readFileSafe(stateFilePath)
  return parseStateSafe(stateFilePath, raw)
}

export function writeState(stateFilePath: string, state: WorkflowStateType): void {
  const tmpPath = `${stateFilePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tmpPath, stateFilePath)
}

export function stateFileExists(stateFilePath: string): boolean {
  return existsSync(stateFilePath)
}

function readFileSafe(stateFilePath: string): string {
  try {
    return readFileSync(stateFilePath, 'utf-8')
  } catch (cause) {
    throw new WorkflowError(`Cannot read state file at ${stateFilePath}: ${String(cause)}`)
  }
}

function parseStateSafe(stateFilePath: string, raw: string): WorkflowStateType {
  const json = tryParseJson(stateFilePath, raw)
  const result = WorkflowStateSchema.safeParse(json)
  if (!result.success) {
    throw new WorkflowError(`Invalid state file at ${stateFilePath}: ${result.error.message}`)
  }
  return result.data
}

function tryParseJson(stateFilePath: string, raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw new WorkflowError(`Cannot parse state file at ${stateFilePath}: ${String(cause)}`)
  }
}

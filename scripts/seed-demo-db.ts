import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, unlinkSync } from 'node:fs'
import { createStore } from '../src/workflow-event-store/sqlite-event-store.js'
import type { BaseEvent } from '@ntcoding/agentic-workflow-builder/engine'

const DB_PATH = join(tmpdir(), 'workflow-demo.db')

function ev(type: string, at: string, extra: Record<string, unknown> = {}): BaseEvent {
  return { type, at, ...extra }
}

function t(base: Date, offsetMs: number): string {
  return new Date(base.getTime() + offsetMs).toISOString()
}

function seedCompletedSession(store: ReturnType<typeof createStore>): void {
  const base = new Date('2026-01-15T10:00:00.000Z')
  store.appendEvents('session-completed', [
    ev('session-started', t(base, 0), { sessionId: 'session-completed' }),
    ev('issue-recorded', t(base, 5_000), { issueNumber: 42 }),
    ev('branch-recorded', t(base, 8_000), { branch: 'feature/add-pdf-export' }),
    ev('transitioned', t(base, 15_000), { from: 'SPAWN', to: 'PLANNING' }),
    ev('plan-approval-recorded', t(base, 120_000)),
    ev('transitioned', t(base, 125_000), { from: 'PLANNING', to: 'RESPAWN' }),
    ev('agent-registered', t(base, 130_000), { agentType: 'developer-1', agentId: 'dev-001' }),
    ev('agent-registered', t(base, 131_000), { agentType: 'reviewer-1', agentId: 'rev-001' }),
    ev('transitioned', t(base, 135_000), { from: 'RESPAWN', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(base, 140_000), { task: 'Implement PDF rendering for invoice line items' }),
    ev('write-checked', t(base, 200_000), { tool: 'Write', filePath: 'src/pdf-renderer.ts', allowed: true }),
    ev('write-checked', t(base, 210_000), { tool: 'Write', filePath: 'src/pdf-renderer.spec.ts', allowed: true }),
    ev('bash-checked', t(base, 250_000), { tool: 'Bash', command: 'npm test', allowed: true }),
    ev('developer-done-signaled', t(base, 300_000)),
    ev('transitioned', t(base, 305_000), { from: 'DEVELOPING', to: 'REVIEWING' }),
    ev('review-approved', t(base, 350_000)),
    ev('transitioned', t(base, 355_000), { from: 'REVIEWING', to: 'COMMITTING' }),
    ev('lint-ran', t(base, 360_000), { files: 2, passed: true }),
    ev('bash-checked', t(base, 365_000), { tool: 'Bash', command: 'git commit -m "Add PDF export"', allowed: true }),
    ev('transitioned', t(base, 400_000), { from: 'COMMITTING', to: 'CR_REVIEW' }),
    ev('coderabbit-addressed', t(base, 450_000)),
    ev('transitioned', t(base, 455_000), { from: 'CR_REVIEW', to: 'PR_CREATION' }),
    ev('pr-created', t(base, 460_000), { prNumber: 99 }),
    ev('transitioned', t(base, 500_000), { from: 'PR_CREATION', to: 'COMPLETE' }),
    ev('agent-shut-down', t(base, 510_000), { agentName: 'lead' }),
  ])
}

function seedBlockedSession(store: ReturnType<typeof createStore>): void {
  const base = new Date('2026-01-16T14:00:00.000Z')
  store.appendEvents('session-blocked', [
    ev('session-started', t(base, 0), { sessionId: 'session-blocked' }),
    ev('issue-recorded', t(base, 5_000), { issueNumber: 43 }),
    ev('branch-recorded', t(base, 8_000), { branch: 'feature/auth-refactor' }),
    ev('transitioned', t(base, 15_000), { from: 'SPAWN', to: 'PLANNING' }),
    ev('plan-approval-recorded', t(base, 90_000)),
    ev('transitioned', t(base, 95_000), { from: 'PLANNING', to: 'RESPAWN' }),
    ev('agent-registered', t(base, 100_000), { agentType: 'developer-1', agentId: 'dev-002' }),
    ev('transitioned', t(base, 105_000), { from: 'RESPAWN', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(base, 110_000), { task: 'Extract auth middleware into separate module' }),
    ev('write-checked', t(base, 150_000), { tool: 'Write', filePath: 'src/auth.ts', allowed: true }),
    ev('bash-checked', t(base, 180_000), { tool: 'Bash', command: 'git commit', allowed: false }),
    ev('idle-checked', t(base, 200_000), { agentName: 'developer-1', allowed: false }),
    ev('transitioned', t(base, 210_000), { from: 'DEVELOPING', to: 'BLOCKED' }),
    ev('journal-entry', t(base, 215_000), { agentName: 'lead', content: 'Blocked: auth provider requires API key not available in CI' }),
    ev('transitioned', t(base, 300_000), { from: 'BLOCKED', to: 'DEVELOPING' }),
    ev('developer-done-signaled', t(base, 400_000)),
    ev('transitioned', t(base, 405_000), { from: 'DEVELOPING', to: 'REVIEWING' }),
    ev('review-rejected', t(base, 450_000)),
    ev('transitioned', t(base, 455_000), { from: 'REVIEWING', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(base, 460_000), { task: 'Fix review feedback: add error handling for token refresh' }),
    ev('write-checked', t(base, 500_000), { tool: 'Write', filePath: 'src/auth.ts', allowed: true }),
    ev('developer-done-signaled', t(base, 550_000)),
    ev('transitioned', t(base, 555_000), { from: 'DEVELOPING', to: 'REVIEWING' }),
    ev('review-approved', t(base, 600_000)),
    ev('transitioned', t(base, 605_000), { from: 'REVIEWING', to: 'COMMITTING' }),
    ev('agent-shut-down', t(base, 650_000), { agentName: 'lead' }),
  ])
}

function seedMultiIterationSession(store: ReturnType<typeof createStore>): void {
  const base = new Date('2026-01-17T09:00:00.000Z')
  store.appendEvents('session-multi-iter', [
    ev('session-started', t(base, 0), { sessionId: 'session-multi-iter' }),
    ev('issue-recorded', t(base, 5_000), { issueNumber: 44 }),
    ev('branch-recorded', t(base, 8_000), { branch: 'feature/dashboard-charts' }),
    ev('transitioned', t(base, 15_000), { from: 'SPAWN', to: 'PLANNING' }),
    ev('plan-approval-recorded', t(base, 60_000)),
    ev('transitioned', t(base, 65_000), { from: 'PLANNING', to: 'RESPAWN' }),
    ev('agent-registered', t(base, 70_000), { agentType: 'developer-1', agentId: 'dev-003' }),
    ev('agent-registered', t(base, 71_000), { agentType: 'reviewer-1', agentId: 'rev-003' }),
    ev('transitioned', t(base, 75_000), { from: 'RESPAWN', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(base, 80_000), { task: 'Add bar chart component with D3.js integration' }),
    ev('write-checked', t(base, 120_000), { tool: 'Write', filePath: 'src/charts/bar.ts', allowed: true }),
    ev('write-checked', t(base, 130_000), { tool: 'Write', filePath: 'src/charts/bar.spec.ts', allowed: true }),
    ev('plugin-read-checked', t(base, 140_000), { tool: 'Read', path: '/plugin/src/index.ts', allowed: false }),
    ev('developer-done-signaled', t(base, 200_000)),
    ev('transitioned', t(base, 205_000), { from: 'DEVELOPING', to: 'REVIEWING' }),
    ev('review-approved', t(base, 250_000)),
    ev('transitioned', t(base, 255_000), { from: 'REVIEWING', to: 'COMMITTING' }),
    ev('lint-ran', t(base, 260_000), { files: 2, passed: true }),
    ev('transitioned', t(base, 280_000), { from: 'COMMITTING', to: 'RESPAWN' }),
    ev('agent-shut-down', t(base, 282_000), { agentName: 'developer-1' }),
    ev('agent-shut-down', t(base, 283_000), { agentName: 'reviewer-1' }),
    ev('agent-registered', t(base, 290_000), { agentType: 'developer-2', agentId: 'dev-004' }),
    ev('agent-registered', t(base, 291_000), { agentType: 'reviewer-2', agentId: 'rev-004' }),
    ev('transitioned', t(base, 295_000), { from: 'RESPAWN', to: 'DEVELOPING' }),
    ev('iteration-task-assigned', t(base, 300_000), { task: 'Add pie chart component and dashboard layout' }),
    ev('write-checked', t(base, 350_000), { tool: 'Write', filePath: 'src/charts/pie.ts', allowed: true }),
    ev('write-checked', t(base, 360_000), { tool: 'Write', filePath: 'src/dashboard.ts', allowed: true }),
    ev('developer-done-signaled', t(base, 420_000)),
    ev('transitioned', t(base, 425_000), { from: 'DEVELOPING', to: 'REVIEWING' }),
    ev('review-approved', t(base, 470_000)),
    ev('transitioned', t(base, 475_000), { from: 'REVIEWING', to: 'COMMITTING' }),
    ev('lint-ran', t(base, 480_000), { files: 3, passed: true }),
    ev('transitioned', t(base, 500_000), { from: 'COMMITTING', to: 'CR_REVIEW' }),
    ev('coderabbit-addressed', t(base, 540_000)),
    ev('transitioned', t(base, 545_000), { from: 'CR_REVIEW', to: 'PR_CREATION' }),
    ev('pr-created', t(base, 550_000), { prNumber: 101 }),
    ev('transitioned', t(base, 580_000), { from: 'PR_CREATION', to: 'COMPLETE' }),
    ev('agent-shut-down', t(base, 590_000), { agentName: 'lead' }),
  ])
}

if (existsSync(DB_PATH)) unlinkSync(DB_PATH)
const store = createStore(DB_PATH)

seedCompletedSession(store)
seedBlockedSession(store)
seedMultiIterationSession(store)

process.stdout.write(`Seeded demo DB at: ${DB_PATH}\n`)
process.stdout.write(`3 sessions: session-completed, session-blocked, session-multi-iter\n`)

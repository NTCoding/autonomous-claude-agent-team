import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore } from '../workflow-event-store/sqlite-event-store.js'
import type { BaseEvent } from '../workflow-engine/index.js'
import { generateViewerHtml } from './workflow-viewer-html.js'

const tmpDb = (name: string): string => join(tmpdir(), `workflow-viewer-html-spec-${name}.db`)

function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path)
}

function ev(type: string, at: string, extra: Record<string, unknown> = {}): BaseEvent {
  return { type, at, ...extra }
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-01T00:01:00.000Z'
const T2 = '2026-01-01T00:02:00.000Z'

describe('generateViewerHtml — empty store', () => {
  const dbPath = tmpDb('empty')
  afterAll(() => { cleanup(dbPath) })

  it('returns valid HTML document', () => {
    const store = createStore(dbPath)
    const html = generateViewerHtml(store)
    expect(html.startsWith('<!DOCTYPE html>')).toStrictEqual(true)
    expect(html).toContain('</html>')
  })

  it('contains empty session data', () => {
    const store = createStore(dbPath)
    const html = generateViewerHtml(store)
    expect(html).toContain('var SESSIONS=[]')
    expect(html).toContain('var SESSION_DETAILS={}')
  })

  it('contains viewer UI structure', () => {
    const store = createStore(dbPath)
    const html = generateViewerHtml(store)
    expect(html).toContain('id="sessions-body"')
    expect(html).toContain('id="session-detail-view"')
    expect(html).toContain('id="back-btn"')
  })
})

describe('generateViewerHtml — with sessions', () => {
  const dbPath = tmpDb('sessions')
  afterAll(() => { cleanup(dbPath) })

  it('embeds session list data as JSON', () => {
    const store = createStore(dbPath)
    store.appendEvents('test-session', [ev('ev.start', T0), ev('ev.end', T1)])
    const html = generateViewerHtml(store)
    expect(html).toContain('"sessionId":"test-session"')
  })

  it('embeds session detail data as JSON', () => {
    const store = createStore(dbPath)
    store.appendEvents('detail-sess', [
      ev('ev.start', T0),
      ev('workflow.state.transitioned', T1, { toState: 'working' }),
      ev('ev.end', T2),
    ])
    const html = generateViewerHtml(store)
    expect(html).toContain('"detail-sess"')
    expect(html).toContain('"currentState":"working"')
  })

  it('includes multiple sessions', () => {
    const store = createStore(dbPath)
    store.appendEvents('multi-a', [ev('ev.start', T0)])
    store.appendEvents('multi-b', [ev('ev.start', T1)])
    const html = generateViewerHtml(store)
    expect(html).toContain('"multi-a"')
    expect(html).toContain('"multi-b"')
  })
})

describe('generateViewerHtml — script injection safety', () => {
  const dbPath = tmpDb('safety')
  afterAll(() => { cleanup(dbPath) })

  it('escapes closing script tags in session data', () => {
    const store = createStore(dbPath)
    store.appendEvents('safe</script>', [ev('ev', T0)])
    const html = generateViewerHtml(store)
    expect(html).not.toContain('"safe</script>"')
    expect(html).toContain('safe<\\/')
  })
})

describe('generateViewerHtml — contains CSS and client script', () => {
  const dbPath = tmpDb('assets')
  afterAll(() => { cleanup(dbPath) })

  it('includes CSS styles', () => {
    const store = createStore(dbPath)
    const html = generateViewerHtml(store)
    expect(html).toContain('<style>')
    expect(html).toContain('font-family: system-ui')
  })

  it('includes client-side rendering functions', () => {
    const store = createStore(dbPath)
    const html = generateViewerHtml(store)
    expect(html).toContain('function loadSessionList')
    expect(html).toContain('function loadSessionDetail')
    expect(html).toContain('function renderTimeline')
  })
})

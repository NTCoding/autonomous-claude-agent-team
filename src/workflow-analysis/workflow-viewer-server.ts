import * as http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import type { EventStore } from '../workflow-event-store/sqlite-event-store.js'
import { readEvents, listSessions } from '../workflow-event-store/sqlite-event-store.js'
import { buildSessionViewData, buildSessionListItem } from './session-view.js'

export type TimerId = ReturnType<typeof globalThis.setTimeout>

export type ViewerServerDeps = {
  readonly openBrowser: (url: string) => void
  readonly scheduleTimeout: (fn: () => void, ms: number) => TimerId
  readonly cancelTimeout: (id: TimerId | undefined) => void
}

export type ViewerServer = {
  readonly url: string
  readonly close: () => void
}

export type HttpResponse = {
  writeHead: (statusCode: number, headers?: Record<string, string>) => void
  end: (data?: string) => void
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

const __dirname = dirname(fileURLToPath(import.meta.url))
const VIEWER_HTML_PATH = join(__dirname, 'viewer', 'index.html')

function readViewerHtml(): string {
  return readFileSync(VIEWER_HTML_PATH, 'utf-8')
}

function sendJson(res: HttpResponse, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

function sendHtml(res: HttpResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(html)),
  })
  res.end(html)
}

function sendNotFound(res: HttpResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
}

export function routeRequest(
  url: string,
  res: HttpResponse,
  store: EventStore
): void {
  if (url === '/api/sessions') {
    const sessionIds = listSessions(store)
    const items = sessionIds.map((id) => buildSessionListItem(id, readEvents(store, id)))
    sendJson(res, items)
    return
  }

  const eventsMatch = /^\/api\/sessions\/([^/]+)\/events$/.exec(url)
  if (eventsMatch) {
    const sessionId = extractCaptureGroup(eventsMatch, 1)
    const events = readEvents(store, sessionId)
    const viewData = buildSessionViewData(sessionId, events)
    sendJson(res, viewData)
    return
  }

  if (url === '/') {
    const html = readViewerHtml()
    sendHtml(res, html)
    return
  }

  sendNotFound(res)
}

export function extractCaptureGroup(match: RegExpExecArray, index: number): string {
  const value = match[index]
  if (value !== undefined) return value
  return ''
}

export function extractServerPort(address: ReturnType<http.Server['address']>): number {
  if (address !== null && typeof address === 'object') return address.port
  return 0
}

export function extractRequestUrl(req: { url?: string | undefined }): string {
  if (req.url !== undefined) return req.url
  return '/'
}

export function startViewerServer(store: EventStore, deps: ViewerServerDeps): ViewerServer {
  const timerRef: { id: TimerId | undefined } = { id: undefined }

  const resetTimer = (server: http.Server): void => {
    if (timerRef.id !== undefined) {
      deps.cancelTimeout(timerRef.id)
    }
    timerRef.id = deps.scheduleTimeout(() => {
      server.close()
    }, INACTIVITY_TIMEOUT_MS)
  }

  const server = http.createServer((req, res) => {
    resetTimer(server)
    routeRequest(extractRequestUrl(req), res, store)
  })

  server.listen(0)

  const url = `http://localhost:${extractServerPort(server.address())}`

  resetTimer(server)

  deps.openBrowser(url)

  return {
    url,
    close: () => {
      if (timerRef.id !== undefined) {
        deps.cancelTimeout(timerRef.id)
      }
      server.close()
    },
  }
}

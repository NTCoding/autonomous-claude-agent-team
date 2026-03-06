import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import { createRouter, sendError } from './router.js'
import type { Router } from './router.js'
import { createSseHub } from './sse-hub.js'
import type { SseHub } from './sse-hub.js'
import { createStaticFileServer } from './static-assets.js'
import type { StaticFileServer } from './static-assets.js'
import {
  handleListSessions,
  handleGetSession,
  handleGetSessionEvents,
  handleGetSessionJournal,
  handleGetSessionInsights,
} from './handlers/session-handlers.js'
import type { SessionHandlerDeps } from './handlers/session-handlers.js'
import {
  handleAnalyticsOverview,
  handleAnalyticsTrends,
  handleAnalyticsPatterns,
  handleAnalyticsCompare,
} from './handlers/analytics-handlers.js'
import type { AnalyticsHandlerDeps } from './handlers/analytics-handlers.js'
import type { SessionQueryDeps } from '../query/session-queries.js'

export type HttpServerDeps = {
  readonly queryDeps: SessionQueryDeps
  readonly distDir: string
  readonly now: () => Date
}

export type HttpServerInstance = {
  readonly server: Server
  readonly router: Router
  readonly sseHub: SseHub
  readonly staticFiles: StaticFileServer
  readonly start: (port: number) => Promise<void>
  readonly stop: () => Promise<void>
}

export function createHttpServer(deps: HttpServerDeps): HttpServerInstance {
  const router = createRouter()
  const sseHub = createSseHub()
  const staticFiles = createStaticFileServer(deps.distDir)

  const sessionDeps: SessionHandlerDeps = {
    queryDeps: deps.queryDeps,
    now: deps.now,
  }

  const analyticsDeps: AnalyticsHandlerDeps = {
    queryDeps: deps.queryDeps,
    now: deps.now,
  }

  router.get('/api/sessions', handleListSessions(sessionDeps))
  router.get('/api/sessions/:id', handleGetSession(sessionDeps))
  router.get('/api/sessions/:id/events', handleGetSessionEvents(sessionDeps))
  router.get('/api/sessions/:id/journal', handleGetSessionJournal(sessionDeps))
  router.get('/api/sessions/:id/insights', handleGetSessionInsights(sessionDeps))
  router.get('/api/analytics/overview', handleAnalyticsOverview(analyticsDeps))
  router.get('/api/analytics/trends', handleAnalyticsTrends(analyticsDeps))
  router.get('/api/analytics/patterns', handleAnalyticsPatterns(analyticsDeps))
  router.get('/api/analytics/compare', handleAnalyticsCompare(analyticsDeps))

  let connectionCounter = 0

  router.get('/events', (req, res, route) => {
    const sessionFilter = route.query.get('session') ?? undefined
    const connId = `conn-${++connectionCounter}`
    sseHub.addConnection(connId, res, sessionFilter)
  })

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const handled = await router.handle(req, res)
      if (handled) return

      const urlPath = (req.url ?? '/').split('?')[0] ?? '/'
      if (staticFiles.serve(urlPath, res)) return

      sendError(res, 404, 'Not found')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      sendError(res, 500, message)
    }
  })

  return {
    server,
    router,
    sseHub,
    staticFiles,

    start(port) {
      return new Promise((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, () => {
          sseHub.startHeartbeat()
          resolve()
        })
      })
    },

    stop() {
      return new Promise((resolve) => {
        sseHub.stopHeartbeat()
        server.close(() => resolve())
      })
    },
  }
}

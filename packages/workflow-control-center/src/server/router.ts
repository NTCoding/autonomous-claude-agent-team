import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'

export type RouteParams = {
  readonly path: string
  readonly query: URLSearchParams
  readonly params: Record<string, string>
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  route: RouteParams,
) => void | Promise<void>

type Route = {
  readonly method: string
  readonly pattern: RegExp
  readonly paramNames: ReadonlyArray<string>
  readonly handler: RouteHandler
}

export type Router = {
  readonly get: (pattern: string, handler: RouteHandler) => void
  readonly handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
}

function patternToRegex(pattern: string): { regex: RegExp; paramNames: ReadonlyArray<string> } {
  const paramNames: Array<string> = []
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name: string) => {
    paramNames.push(name)
    return '([^/]+)'
  })
  return { regex: new RegExp(`^${regexStr}$`), paramNames }
}

export function createRouter(): Router {
  const routes: Array<Route> = []

  return {
    get(pattern, handler) {
      const { regex, paramNames } = patternToRegex(pattern)
      routes.push({ method: 'GET', pattern: regex, paramNames, handler })
    },

    async handle(req, res) {
      const method = req.method ?? 'GET'
      const urlStr = req.url ?? '/'
      const parsedUrl = new URL(urlStr, 'http://localhost')
      const pathname = parsedUrl.pathname

      for (const route of routes) {
        if (route.method !== method) continue
        const match = route.pattern.exec(pathname)
        if (!match) continue

        const params: Record<string, string> = {}
        for (let i = 0; i < route.paramNames.length; i++) {
          const name = route.paramNames[i]
          const value = match[i + 1]
          if (name && value) {
            params[name] = value
          }
        }

        const routeParams: RouteParams = {
          path: pathname,
          query: parsedUrl.searchParams,
          params,
        }

        await route.handler(req, res, routeParams)
        return true
      }

      return false
    },
  }
}

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

export function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message })
}

import type { ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

export type StaticFileServer = {
  readonly serve: (path: string, res: ServerResponse) => boolean
}

export type StaticFileDeps = {
  readonly readFile: (path: string) => Buffer
  readonly fileExists: (path: string) => boolean
}

const defaultDeps: StaticFileDeps = {
  readFile: readFileSync,
  fileExists: existsSync,
}

export function createStaticFileServer(
  distDir: string,
  deps: StaticFileDeps = defaultDeps,
): StaticFileServer {
  return {
    serve(urlPath, res) {
      const safePath = urlPath.replace(/\.\./g, '')
      const filePath =
        safePath === '/' || safePath === ''
          ? join(distDir, 'index.html')
          : join(distDir, safePath)

      if (!deps.fileExists(filePath)) {
        return false
      }

      const content = deps.readFile(filePath)
      const ext = extname(filePath)
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
      })
      res.end(content)
      return true
    },
  }
}

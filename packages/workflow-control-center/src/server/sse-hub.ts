import type { ServerResponse } from 'node:http'

export type SseConnection = {
  readonly id: string
  readonly res: ServerResponse
  readonly sessionFilter: string | undefined
  readonly connectedAt: string
}

export type SseHub = {
  readonly addConnection: (id: string, res: ServerResponse, sessionFilter?: string) => void
  readonly removeConnection: (id: string) => void
  readonly broadcast: (eventType: string, data: unknown, sessionId?: string) => void
  readonly connectionCount: () => number
  readonly startHeartbeat: () => void
  readonly stopHeartbeat: () => void
}

export function createSseHub(): SseHub {
  const connections = new Map<string, SseConnection>()
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined

  function sendToConnection(conn: SseConnection, eventType: string, data: unknown): void {
    try {
      conn.res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      connections.delete(conn.id)
    }
  }

  return {
    addConnection(id, res, sessionFilter) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      const conn: SseConnection = {
        id,
        res,
        sessionFilter,
        connectedAt: new Date().toISOString(),
      }

      connections.set(id, conn)

      sendToConnection(conn, 'connected', { connectedAt: conn.connectedAt })

      res.on('close', () => {
        connections.delete(id)
      })
    },

    removeConnection(id) {
      const conn = connections.get(id)
      if (conn) {
        conn.res.end()
        connections.delete(id)
      }
    },

    broadcast(eventType, data, sessionId) {
      for (const conn of connections.values()) {
        if (conn.sessionFilter && sessionId && conn.sessionFilter !== sessionId) {
          continue
        }
        sendToConnection(conn, eventType, data)
      }
    },

    connectionCount() {
      return connections.size
    },

    startHeartbeat() {
      heartbeatInterval = setInterval(() => {
        for (const conn of connections.values()) {
          try {
            conn.res.write(':\n\n')
          } catch {
            connections.delete(conn.id)
          }
        }
      }, 30000)
    },

    stopHeartbeat() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = undefined
      }
    },
  }
}

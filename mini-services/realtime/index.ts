// Meshkī realtime broadcast relay.
//
// Two HTTP servers in one process:
//   • Port 3003 — Socket.io for browser clients. Path MUST be '/' (Caddy rule).
//   • Port 3004 — Internal HTTP endpoints for the Next.js API layer to POST
//     broadcast events after a DB commit. Separated because engine.io on
//     path '/' would otherwise swallow our HTTP routes.
//
// This service owns NO business state — it is a dumb, authenticated relay.
// If it restarts, clients reconnect and resume from a poll; no data is lost
// because the database is the source of truth.

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server } from 'socket.io'
import { jwtVerify, errors as joseErrors } from 'jose'

const SOCKET_PORT = 3003
const INTERNAL_PORT = 3004
const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET || 'meshki-dev-secret-change-me-8f3a9c1e7b2d4f6a8c0e2b4d6f8a0c2e'
const BROADCAST_TOKEN =
  process.env.REALTIME_BROADCAST_TOKEN || 'meshki-dev-broadcast-token'
const SECRET_KEY = new TextEncoder().encode(NEXTAUTH_SECRET)

interface JwtPayload {
  id: string
  role: string
  tenantId: string
  branchIds?: string[]
  activeBranchId?: string | null
}

async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY)
    const p = payload as unknown as JwtPayload
    if (!p.tenantId || !p.id) return null
    return p
  } catch (e) {
    if (e instanceof joseErrors.JWSSignatureVerificationFailed) return null
    if (e instanceof joseErrors.JWTExpired) return null
    return null
  }
}

// ── Internal HTTP server (port 3004) ─────────────────────────────────────────
const internalServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/internal/broadcast') {
      const token = req.headers['x-broadcast-token']
      if (token !== BROADCAST_TOKEN) {
        res.writeHead(401)
        res.end('bad token')
        return
      }
      try {
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c as Buffer))
        await new Promise<void>((resolve) => req.on('end', () => resolve()))
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const room = `branch:${body.branchId}`
        io.to(room).emit('event', {
          type: body.type,
          orderId: body.orderId,
          payload: body.payload,
          ts: Date.now(),
        })
        res.writeHead(200)
        res.end('ok')
      } catch {
        res.writeHead(400)
        res.end('bad body')
      }
      return
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          uptime: process.uptime(),
          wsConnections: io.engine.clientsCount,
        }),
      )
      return
    }
    res.writeHead(404)
    res.end('not found')
  },
)

// ── Socket.io server (port 3003) ─────────────────────────────────────────────
const ioServer = createServer()
const io = new Server(ioServer, {
  path: '/', // DO NOT change — Caddy forwards on this path
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) return next(new Error('no token'))
  const payload = await verifyToken(token)
  if (!payload) return next(new Error('bad token'))
  ;(socket.data as { user: JwtPayload }).user = payload
  next()
})

io.on('connection', (socket) => {
  const user = (socket.data as { user: JwtPayload }).user
  const branchIds = user.branchIds ?? (user.activeBranchId ? [user.activeBranchId] : [])

  // Server-controlled room membership. The client CANNOT join arbitrary rooms.
  for (const branchId of branchIds) {
    socket.join(`branch:${branchId}`)
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'ws_connect',
      userId: user.id,
      tenantId: user.tenantId,
      branchIds,
      ts: new Date().toISOString(),
    }),
  )

  socket.on('disconnect', (reason) => {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'ws_disconnect',
        userId: user.id,
        reason,
        ts: new Date().toISOString(),
      }),
    )
  })
})

ioServer.listen(SOCKET_PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'realtime_ws_started',
      port: SOCKET_PORT,
      ts: new Date().toISOString(),
    }),
  )
})

internalServer.listen(INTERNAL_PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'realtime_internal_started',
      port: INTERNAL_PORT,
      ts: new Date().toISOString(),
    }),
  )
})

function shutdown() {
  console.log(JSON.stringify({ level: 'info', event: 'realtime_shutdown', ts: new Date().toISOString() }))
  io.close(() => ioServer.close(() => internalServer.close(() => process.exit(0))))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

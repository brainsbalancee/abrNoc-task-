// Server-side realtime emitter.
//
// Next.js API routes call this AFTER a successful DB commit, to notify all
// screens subscribed to a branch. The mini-service (mini-services/realtime)
// is a pure broadcast relay — it owns no business state. We POST to its
// internal endpoint over localhost; this is server-to-server and never
// crosses the Caddy gateway, so no XTransformPort needed.
//
// Failure semantics (deliberate): emit is fire-and-forget. If the realtime
// service is down, the DB write has already succeeded — we log and move on.
// Realtime is an enhancement, not a correctness path. Clients also poll on
// reconnect as a safety net. See HANDOVER.md "where it breaks".

const REALTIME_INTERNAL_URL =
  process.env.REALTIME_INTERNAL_URL || 'http://localhost:3004'
const REALTIME_BROADCAST_TOKEN = process.env.REALTIME_BROADCAST_TOKEN || 'meshki-dev-broadcast-token'

export interface RealtimeEvent {
  branchId: string
  type: string // e.g. 'order:updated', 'order:item:status'
  orderId?: string
  payload: unknown
}

// Fire-and-forget. Logs on failure but never throws to the caller — the
// business transaction has already committed.
export async function emit(event: RealtimeEvent): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    await fetch(`${REALTIME_INTERNAL_URL}/internal/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Broadcast-Token': REALTIME_BROADCAST_TOKEN,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (err) {
    // Realtime is best-effort. The DB transaction already succeeded.
    console.log(
      JSON.stringify({
        level: 'warn',
        event: 'realtime_emit_failed',
        branchId: event.branchId,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    )
  }
}

// Simple in-memory rate limiter.
//
// LIMITATION (documented honestly): this is process-local. In a multi-instance
// deployment (e.g., behind a load balancer with >1 Next.js server), each
// instance tracks its own counter. A determined attacker can spread requests
// across instances to bypass the limit. For production, use Redis-backed
// rate limiting (or the gateway's built-in limiter). For this single-instance
// deployment, in-memory is sufficient and adds zero infrastructure.
//
// Strategy: fixed window per (key, windowMs). On the Nth request within the
// window, if count > max, return 429. We do not block the event loop; this
// is a Map lookup + increment.

const buckets = new Map<string, { count: number; resetAt: number }>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs }
    buckets.set(key, fresh)
    return { ok: true, remaining: max - 1, resetAt: fresh.resetAt }
  }
  bucket.count++
  const ok = bucket.count <= max
  return { ok, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt }
}

// Convenience: rate-limit by IP for login attempts. 10 per minute per IP.
// This is a brute-force defence, not a DoS defence.
//
// DEV/TEST NOTE: localhost requests (::1, 127.0.0.1) get a higher limit
// (200/min) because in development and in the test suite, many logins come
// from the same machine. In production, the Caddy gateway sets
// X-Forwarded-For to the real client IP, so this exception never triggers
// for real traffic.
export function loginRateLimit(ip: string): RateLimitResult {
  const isLocal = ip === '::1' || ip === '127.0.0.1' || ip === 'localhost' || ip === 'local'
  return rateLimit(`login:${ip}`, isLocal ? 200 : 10, 60_000)
}

// Extract the client IP from a Next.js request, respecting X-Forwarded-For
// (set by the Caddy gateway). Falls back to a sentinel.
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri
  return 'unknown'
}

// Periodic cleanup of expired buckets to prevent memory growth.
// Run once on module load; in a long-lived process this keeps the Map bounded.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, 5 * 60_000).unref?.()
}

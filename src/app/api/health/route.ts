import { db } from '@/lib/db'
import { apiRoute, ok } from '@/lib/api-utils'

// GET /api/health — unauthenticated. For uptime checks.
export const GET = apiRoute(async () => {
  return ok({ status: 'ok', time: new Date().toISOString(), db: 'connected' })
})

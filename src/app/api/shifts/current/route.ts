import { db } from '@/lib/db'
import { requireBranch } from '@/lib/tenant'
import { apiRoute, ok, fail } from '@/lib/api-utils'

// GET /api/shifts/current?branchId=...
// Returns the open shift for a branch, with a live snapshot of today's stats.
export const GET = apiRoute(async (req) => {
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  if (!branchId) return fail('branchId required', 400)
  const ctx = await requireBranch(branchId)

  const shift = await db.shift.findFirst({
    where: { branchId, tenantId: ctx.tenantId, closedAt: null },
    orderBy: { openedAt: 'desc' },
    include: {
      orders: {
        select: {
          id: true, number: true, status: true, total: true, createdAt: true,
          table: { select: { label: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!shift) return ok(null)

  // Live aggregates (not stored until close).
  const open = shift.orders.filter((o) => o.status === 'OPEN')
  const closed = shift.orders.filter((o) => o.status === 'CLOSED')
  const grossSoFar = closed.reduce((s, o) => s + o.total, 0)

  return ok({
    ...shift,
    liveStats: {
      openOrders: open.length,
      closedOrders: closed.length,
      grossSoFar,
    },
  })
})

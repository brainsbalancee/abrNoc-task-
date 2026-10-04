import { db } from '@/lib/db'
import { requireBranch } from '@/lib/tenant'
import { apiRoute, ok, fail } from '@/lib/api-utils'

// GET /api/shifts/last-closed?branchId=...
// Returns the most recent CLOSED shift for a branch (with its AI summary).
export const GET = apiRoute(async (req) => {
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  if (!branchId) return fail('branchId required', 400)
  const ctx = await requireBranch(branchId)
  const shift = await db.shift.findFirst({
    where: { branchId, tenantId: ctx.tenantId, closedAt: { not: null } },
    orderBy: { closedAt: 'desc' },
    include: {
      orders: { select: { id: true, number: true, status: true, total: true } },
    },
  })
  if (!shift) return ok(null)
  return ok(shift)
})

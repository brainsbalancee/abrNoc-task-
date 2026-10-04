import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'
import { apiRoute, ok, fail } from '@/lib/api-utils'

// GET /api/shifts/[id] — a shift with its AI summary and aggregated stats.
export const GET = apiRoute(async (_req, { params }) => {
  const ctx = await requireTenant()
  const shift = await db.shift.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      orders: {
        select: {
          id: true, number: true, status: true, total: true, createdAt: true, closedAt: true,
          table: { select: { label: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!shift) return fail('Shift not found', 404)
  return ok(shift)
})

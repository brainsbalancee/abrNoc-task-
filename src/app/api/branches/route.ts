import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'
import { apiRoute, ok } from '@/lib/api-utils'

// GET /api/branches — branches the current user may operate in.
export const GET = apiRoute(async () => {
  const ctx = await requireTenant()
  const branches = await db.branch.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, address: true, taxRate: true },
  })
  const data = branches.map((b) => ({
    ...b,
    accessible: ctx.role === 'MANAGER' || ctx.branchIds.includes(b.id),
  }))
  return ok(data)
})

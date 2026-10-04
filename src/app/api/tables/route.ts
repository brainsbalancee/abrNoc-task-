import { db } from '@/lib/db'
import { requireBranch } from '@/lib/tenant'
import { apiRoute, ok, fail } from '@/lib/api-utils'

// GET /api/tables?branchId=...
export const GET = apiRoute(async (req) => {
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  if (!branchId) return fail('branchId required', 400)
  const ctx = await requireBranch(branchId)
  const tables = await db.table.findMany({
    where: { branchId, tenantId: ctx.tenantId, active: true },
    orderBy: { label: 'asc' },
  })
  return ok(tables)
})

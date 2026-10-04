import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'
import { apiRoute, ok } from '@/lib/api-utils'

// GET /api/menu — the tenant's menu (categories + items). Read-only for staff.
export const GET = apiRoute(async () => {
  const ctx = await requireTenant()
  const cats = await db.menuCategory.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: { active: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  return ok(cats)
})

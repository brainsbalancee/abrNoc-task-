import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'
import { apiRoute, ok } from '@/lib/api-utils'

// GET /api/menu — the tenant's full menu (categories + items with Persian names).
// Used by the /menu page (digital menu card) and the waiter item picker.
export const GET = apiRoute(async () => {
  const ctx = await requireTenant()
  const cats = await db.menuCategory.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: { active: true },
        orderBy: { price: 'asc' },
        select: {
          id: true,
          name: true,
          nameFa: true,
          price: true,
          kitchenStation: true,
        },
      },
    },
  })
  return ok(cats)
})

import { db } from '@/lib/db'
import { requireOrderAccess } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail, conflict } from '@/lib/api-utils'
import { isValidItemTransition, canRoleTransitionItem } from '@/lib/order-state'
import { recomputeTotals } from '@/lib/money'
import { emit } from '@/lib/realtime'
import { audit } from '@/lib/audit'
import { z } from 'zod'

const transitionSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
  expectedVersion: z.number().int().min(0),
})

// PATCH /api/orders/[id]/items/[itemId] — advance item status.
// OCC: the client sends the version it last saw. If it's stale, we 409.
// This is the core concurrency-safe mutation in the system.
export const PATCH = apiRoute(async (req, { params }) => {
  const body = await req.json().catch(() => null)
  const parsed = transitionSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid transition payload', 400)
  const { status: newStatus, expectedVersion } = parsed.data
  const { ctx, order } = await requireOrderAccess(params.id)

  const item = await db.orderItem.findFirst({
    where: { id: params.itemId, orderId: order.id },
  })
  if (!item) return fail('Item not found', 404)

  // 1. State machine: is the transition legal?
  if (!isValidItemTransition(item.status, newStatus))
    return fail(`Cannot transition item ${item.status} → ${newStatus}`, 409)

  // 2. Role gate: is this role allowed to perform this transition?
  if (!canRoleTransitionItem(ctx.role, item.status, newStatus))
    return fail(`Role ${ctx.role} cannot transition ${item.status} → ${newStatus}`, 403)

  // 3. OCC: atomic conditional update. count=0 means version mismatch.
  const result = await db.orderItem.updateMany({
    where: { id: item.id, version: expectedVersion },
    data: { status: newStatus, version: { increment: 1 } },
  })
  if (result.count === 0) return conflict('Item was modified by someone else; refresh and retry')

  // 4. Recompute order totals (CANCELLED items drop out of the bill).
  const items = await db.orderItem.findMany({ where: { orderId: order.id } })
  const ord = await db.order.findUnique({ where: { id: order.id } })
  if (ord) {
    const totals = recomputeTotals({
      items: items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, status: i.status })),
      discountAmount: ord.discountAmount,
      serviceRate: ord.serviceRate,
      taxRate: ord.taxRate,
    })
    await db.order.update({
      where: { id: order.id },
      data: { subtotal: totals.subtotal, total: totals.total, version: { increment: 1 } },
    })
  }

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'ITEM_STATUS_CHANGED',
    targetId: item.id,
    detail: { orderId: order.id, from: item.status, to: newStatus },
  })

  await emit({
    branchId: order.branchId,
    type: 'order:item:status',
    orderId: order.id,
    payload: { itemId: item.id, status: newStatus },
  })

  return ok({ id: item.id, status: newStatus })
})

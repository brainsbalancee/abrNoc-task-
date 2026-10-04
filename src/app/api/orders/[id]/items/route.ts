import { db } from '@/lib/db'
import { requireOrderAccess } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail } from '@/lib/api-utils'
import { recomputeTotals } from '@/lib/money'
import { emit } from '@/lib/realtime'
import { audit } from '@/lib/audit'
import { z } from 'zod'

const addItemsSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      quantity: z.number().int().min(1).max(50),
      notes: z.string().max(200).optional(),
    }),
  ).min(1).max(50),
})

// POST /api/orders/[id]/items — add item lines to an order.
// ADDITIVE operation: no OCC needed. Two waiters adding concurrently both succeed.
// We do it in a transaction so totals stay consistent.
export const POST = apiRoute(async (req, { params }) => {
  const body = await req.json().catch(() => null)
  const parsed = addItemsSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid items payload', 400)
  const { ctx, order } = await requireOrderAccess(params.id)
  if (!can(ctx.role, 'order:edit_items')) return fail('Your role cannot add items', 403)

  if (order.tenantId !== ctx.tenantId) return fail('Order not found', 404) // belt-and-braces

  // Verify the order is still OPEN.
  const current = await db.order.findUnique({ where: { id: order.id }, select: { status: true, branchId: true } })
  if (!current || current.status !== 'OPEN') return fail('Order is not open', 409)

  // Verify all menu items belong to the same tenant (IDOR defence — a waiter
  // must not inject another tenant's menuItemId into their order).
  const menuItemIds = parsed.data.items.map((i) => i.menuItemId)
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: menuItemIds }, tenantId: ctx.tenantId, active: true },
    select: { id: true, price: true, name: true },
  })
  if (menuItems.length !== menuItemIds.length)
    return fail('One or more menu items not found in your restaurant', 404)

  // Create items inside a transaction with totals recompute.
  const created = await db.$transaction(async (tx) => {
    const newItems: Awaited<ReturnType<typeof tx.orderItem.create>>[] = []
    for (const it of parsed.data.items) {
      const mi = menuItems.find((m) => m.id === it.menuItemId)!
      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: it.menuItemId,
          tenantId: ctx.tenantId,
          quantity: it.quantity,
          unitPrice: mi.price, // snapshot at order time — price changes don't affect open checks
          notes: it.notes,
          status: 'PENDING',
        },
      })
      newItems.push(item)
    }
    // Recompute totals from the full item set.
    const allItems = await tx.orderItem.findMany({ where: { orderId: order.id } })
    const ord = await tx.order.findUnique({ where: { id: params.id } })
    if (ord) {
      const totals = recomputeTotals({
        items: allItems.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, status: i.status })),
        discountAmount: ord.discountAmount,
        serviceRate: ord.serviceRate,
        taxRate: ord.taxRate,
      })
      await tx.order.update({
        where: { id: ord.id },
        data: { subtotal: totals.subtotal, total: totals.total, version: { increment: 1 } },
      })
    }
    return newItems
  })

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'ORDER_ITEMS_ADDED',
    targetId: order.id,
    detail: { count: created.length },
  })

  await emit({
    branchId: current.branchId,
    type: 'order:items:added',
    orderId: order.id,
    payload: { orderId: order.id, count: created.length },
  })

  return ok(created, 201)
})

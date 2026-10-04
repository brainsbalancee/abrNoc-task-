import { db } from '@/lib/db'
import { requireOrderAccess } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail, conflict } from '@/lib/api-utils'
import { isValidOrderTransition } from '@/lib/order-state'
import { recomputeTotals } from '@/lib/money'
import { emit } from '@/lib/realtime'
import { audit } from '@/lib/audit'
import { z } from 'zod'

// GET /api/orders/[id] — single order with items, payments, table.
export const GET = apiRoute(async (_req, { params }) => {
  const { ctx, order } = await requireOrderAccess(params.id)
  const full = await db.order.findUnique({
    where: { id: order.id },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      table: { select: { label: true } },
      shift: { select: { id: true, openedAt: true, closedAt: true } },
    },
  })
  return ok(full)
})

const patchSchema = z.object({
  expectedVersion: z.number().int().min(0).optional(),
  tableId: z.string().optional(),
  discountAmount: z.number().int().min(0).optional(),
  serviceRate: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
  status: z.enum(['CLOSED', 'VOIDED']).optional(),
})

// PATCH /api/orders/[id] — apply discount/service, move table, close/void.
// Uses OCC on order-level mutations (discount, table, status).
export const PATCH = apiRoute(async (req, { params }) => {
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid patch payload', 400)
  const { ctx, order } = await requireOrderAccess(params.id)
  const patch = parsed.data

  // Permission checks per field.
  if (patch.discountAmount !== undefined && !can(ctx.role, 'order:apply_discount'))
    return fail('Your role cannot apply discounts', 403)
  if (patch.serviceRate !== undefined && !can(ctx.role, 'order:apply_discount'))
    return fail('Your role cannot set service charge', 403)
  if (patch.status === 'CLOSED' && !can(ctx.role, 'order:close'))
    return fail('Your role cannot close orders', 403)
  if (patch.status === 'VOIDED' && !can(ctx.role, 'order:void'))
    return fail('Your role cannot void orders', 403)

  // Re-fetch with version for OCC.
  const current = await db.order.findUnique({ where: { id: order.id } })
  if (!current) return fail('Order not found', 404)
  if (current.status !== 'OPEN' && patch.status !== 'VOIDED')
    return fail(`Order is ${current.status}; cannot edit`, 409)

  // If a status transition is requested, validate it's legal.
  if (patch.status && !isValidOrderTransition(current.status, patch.status))
    return fail(`Cannot transition order ${current.status} → ${patch.status}`, 409)

  // If closing, require a payment recorded (house rule: no zero checks closed).
  if (patch.status === 'CLOSED') {
    const payments = await db.payment.findMany({ where: { orderId: order.id } })
    if (payments.length === 0) return fail('Cannot close an order with no payment recorded', 409)
  }

  // Atomic OCC update. updateMany returns count; 0 means version mismatch → 409.
  if (patch.expectedVersion !== undefined) {
    const result = await db.order.updateMany({
      where: { id: order.id, version: patch.expectedVersion },
      data: {
        tableId: patch.tableId ?? undefined,
        discountAmount: patch.discountAmount ?? undefined,
        serviceRate: patch.serviceRate ?? undefined,
        notes: patch.notes ?? undefined,
        status: patch.status ?? undefined,
        closedAt: patch.status === 'CLOSED' || patch.status === 'VOIDED' ? new Date() : undefined,
        version: { increment: 1 },
      },
    })
    if (result.count === 0) return conflict()
  } else {
    // No version supplied — only allowed for status-only transitions (close/void).
    if (patch.status) {
      await db.order.update({
        where: { id: order.id },
        data: {
          status: patch.status,
          closedAt: new Date(),
          version: { increment: 1 },
        },
      })
    } else {
      return fail('expectedVersion required for field updates', 400)
    }
  }

  // Recompute totals from items (server source of truth).
  const items = await db.orderItem.findMany({ where: { orderId: order.id } })
  const updated = await db.order.findUnique({ where: { id: order.id } })
  if (updated) {
    const totals = recomputeTotals({
      items: items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, status: i.status })),
      discountAmount: updated.discountAmount,
      serviceRate: updated.serviceRate,
      taxRate: updated.taxRate,
    })
    await db.order.update({
      where: { id: order.id },
      data: { subtotal: totals.subtotal, total: totals.total },
    })
  }

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: patch.status === 'VOIDED' ? 'ORDER_VOIDED' : patch.status === 'CLOSED' ? 'ORDER_CLOSED' : 'ORDER_EDITED',
    targetId: order.id,
    detail: patch,
  })

  await emit({
    branchId: order.branchId,
    type: 'order:updated',
    orderId: order.id,
    payload: { id: order.id },
  })

  const fresh = await db.order.findUnique({
    where: { id: order.id },
    include: { items: true, payments: true, table: { select: { label: true } } },
  })
  return ok(fresh)
})

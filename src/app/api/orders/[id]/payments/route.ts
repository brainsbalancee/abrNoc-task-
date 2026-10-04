import { db } from '@/lib/db'
import { requireOrderAccess } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail, conflict } from '@/lib/api-utils'
import { recomputeTotals } from '@/lib/money'
import { emit } from '@/lib/realtime'
import { audit } from '@/lib/audit'
import { z } from 'zod'

const paymentSchema = z.object({
  method: z.enum(['CASH', 'POS']),
  amount: z.number().int().min(1),
})

// POST /api/orders/[id]/payments — record a payment (cash or POS terminal).
// We do NOT process card payments (no rails in Iran). This is a record.
// Split checks: multiple payments allowed. We never let recorded total exceed bill.
export const POST = apiRoute(async (req, { params }) => {
  const body = await req.json().catch(() => null)
  const parsed = paymentSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid payment payload', 400)
  const { method, amount } = parsed.data
  const { ctx, order } = await requireOrderAccess(params.id)
  if (!can(ctx.role, 'order:record_payment')) return fail('Your role cannot record payments', 403)

  const current = await db.order.findUnique({ where: { id: order.id }, include: { payments: true, items: true } })
  if (!current) return fail('Order not found', 404)
  if (current.status !== 'OPEN') return fail('Order is not open', 409)

  const totals = recomputeTotals({
    items: current.items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, status: i.status })),
    discountAmount: current.discountAmount,
    serviceRate: current.serviceRate,
    taxRate: current.taxRate,
  })
  const alreadyPaid = current.payments.reduce((s, p) => s + p.amount, 0)
  if (alreadyPaid + amount > totals.total)
    return fail(`Payment exceeds remaining balance (${totals.total - alreadyPaid} Toman)`, 409)

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      tenantId: ctx.tenantId,
      method,
      amount,
    },
  })

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'PAYMENT_RECORDED',
    targetId: order.id,
    detail: { method, amount, paymentId: payment.id },
  })

  await emit({
    branchId: order.branchId,
    type: 'order:payment',
    orderId: order.id,
    payload: { paymentId: payment.id, method, amount },
  })

  return ok(payment, 201)
})

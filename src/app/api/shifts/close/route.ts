import { db } from '@/lib/db'
import { requireBranch } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail } from '@/lib/api-utils'
import { generateShiftSummary } from '@/lib/ai-summary'
import { audit } from '@/lib/audit'
import { z } from 'zod'

const closeSchema = z.object({ branchId: z.string().min(1) })

// POST /api/shifts/close — manager closes the open shift for a branch.
// Computes aggregates, then generates the AI shift summary (with fallback).
export const POST = apiRoute(async (req) => {
  const body = await req.json().catch(() => null)
  const parsed = closeSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid payload', 400)
  const { branchId } = parsed.data
  const ctx = await requireBranch(branchId)
  if (!can(ctx.role, 'shift:close')) return fail('Your role cannot close shifts', 403)

  const shift = await db.shift.findFirst({
    where: { branchId, tenantId: ctx.tenantId, closedAt: null },
  })
  if (!shift) return fail('No open shift to close', 404)

  // Refuse to close if there are still OPEN orders (cashier must close them first).
  const openOrders = await db.order.count({
    where: { shiftId: shift.id, status: 'OPEN' },
  })
  if (openOrders > 0)
    return fail(`Cannot close: ${openOrders} open order(s) still need to be closed`, 409)

  // Compute deterministic aggregates.
  const orders = await db.order.findMany({ where: { shiftId: shift.id } })
  const closedOrders = orders.filter((o) => o.status === 'CLOSED')
  const grossTotal = closedOrders.reduce((s, o) => s + o.total, 0)
  const voidCount = orders.filter((o) => o.status === 'VOIDED').length

  await db.shift.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(),
      closedBy: ctx.userId,
      orderCount: closedOrders.length,
      grossTotal,
      voidCount,
    },
  })

  // Generate the AI summary (with graceful fallback). This may take 5-15s.
  const result = await generateShiftSummary(shift.id, ctx.tenantId)
  if (result) {
    await db.shift.update({
      where: { id: shift.id },
      data: { aiSummary: result.summary, aiModel: result.model },
    })
  }

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'SHIFT_CLOSED',
    targetId: shift.id,
    detail: { grossTotal, orderCount: closedOrders.length, summarySource: result?.source },
  })

  const fresh = await db.shift.findUnique({ where: { id: shift.id } })
  return ok({ shift: fresh, summary: result?.summary, source: result?.source })
})

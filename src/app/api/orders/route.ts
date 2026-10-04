import { db } from '@/lib/db'
import { requireBranch } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail } from '@/lib/api-utils'
import { z } from 'zod'
import { recomputeTotals } from '@/lib/money'
import { emit } from '@/lib/realtime'

// GET /api/orders?branchId=...&status=OPEN
// Lists orders for a branch's open shift (default) or by status.
export const GET = apiRoute(async (req) => {
  const url = new URL(req.url)
  const branchId = url.searchParams.get('branchId')
  if (!branchId) return fail('branchId required', 400)
  const status = url.searchParams.get('status') ?? 'OPEN'
  const ctx = await requireBranch(branchId)
  const orders = await db.order.findMany({
    where: { branchId, tenantId: ctx.tenantId, status: status as 'OPEN' | 'CLOSED' | 'VOIDED' },
    orderBy: { createdAt: 'desc' },
    include: {
      table: { select: { label: true } },
      items: { orderBy: { createdAt: 'asc' } },
    },
    take: 100,
  })
  return ok(orders)
})

const createSchema = z.object({
  branchId: z.string().min(1),
  tableId: z.string().min(1),
  notes: z.string().max(500).optional(),
})

// POST /api/orders — waiter opens a new check for a table.
export const POST = apiRoute(async (req) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return fail('Invalid order payload', 400)
  const { branchId, tableId, notes } = parsed.data
  const ctx = await requireBranch(branchId)
  if (!can(ctx.role, 'order:create')) return fail('Your role cannot create orders', 403)

  // Verify table belongs to this branch+tenant (IDOR defence).
  const table = await db.table.findFirst({
    where: { id: tableId, branchId, tenantId: ctx.tenantId, active: true },
  })
  if (!table) return fail('Table not found in this branch', 404)

  // Prevent a second OPEN order on the same table — a table has one open check.
  const existing = await db.order.findFirst({
    where: { tableId, branchId, status: 'OPEN' },
    select: { id: true, number: true },
  })
  if (existing) return fail(`Table ${table.label} already has an open check (#${existing.number})`, 409)

  // Get or open a shift for the branch (lazily, so a waiter can start a shift).
  const branch = await db.branch.findUnique({ where: { id: branchId } })
  if (!branch) return fail('Branch not found', 404)
  let shift = await db.shift.findFirst({
    where: { branchId, tenantId: ctx.tenantId, closedAt: null },
    orderBy: { openedAt: 'desc' },
  })
  if (!shift) {
    if (!can(ctx.role, 'shift:open')) return fail('No open shift and you cannot open one', 403)
    shift = await db.shift.create({
      data: { tenantId: ctx.tenantId, branchId, openedBy: ctx.userId },
    })
  }

  // Sequential order number per branch — computed via count+1 (good enough for
  // SQLite single-writer; documented limitation in HANDOVER.md).
  const count = await db.order.count({ where: { branchId } })
  const number = count + 1

  const order = await db.order.create({
    data: {
      tenantId: ctx.tenantId,
      branchId,
      shiftId: shift.id,
      tableId,
      waiterId: ctx.userId,
      number,
      status: 'OPEN',
      taxRate: branch.taxRate,
      notes,
    },
    include: { items: true, table: { select: { label: true } } },
  })

  await emit({
    branchId,
    type: 'order:created',
    orderId: order.id,
    payload: { id: order.id, number: order.number, table: table.label },
  })

  return ok(order, 201)
})

import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'
import { can } from '@/lib/roles'
import { apiRoute, ok, fail } from '@/lib/api-utils'
import { generateShiftSummary } from '@/lib/ai-summary'

// POST /api/reports/shift-summary?shiftId=...
// Regenerate the AI summary for a shift (e.g. if the first run fell back).
export const POST = apiRoute(async (req) => {
  const url = new URL(req.url)
  const shiftId = url.searchParams.get('shiftId')
  if (!shiftId) return fail('shiftId required', 400)
  const ctx = await requireTenant()
  if (!can(ctx.role, 'reports:read')) return fail('Your role cannot read reports', 403)

  // Verify ownership.
  const shift = await db.shift.findFirst({
    where: { id: shiftId, tenantId: ctx.tenantId },
    select: { id: true, closedAt: true },
  })
  if (!shift) return fail('Shift not found', 404)
  if (!shift.closedAt) return fail('Shift is still open; close it first', 409)

  const result = await generateShiftSummary(shiftId, ctx.tenantId)
  if (!result) return fail('Could not generate summary', 500)

  await db.shift.update({
    where: { id: shiftId },
    data: { aiSummary: result.summary, aiModel: result.model },
  })

  return ok({ summary: result.summary, source: result.source, model: result.model })
})

// AI shift summary — the one AI capability we ship.
//
// DESIGN (defended in DECISIONS.md & AI_USAGE.md):
//   - Input is STRUCTURED DB data only (counts, totals, item names, timestamps).
//     Never free user text. Prompt-injection surface is therefore minimal:
//     a malicious item note cannot reach the model because we don't send notes.
//   - Output is rendered as text only. We never execute or parse it as
//     instructions. We cap its length and strip control chars.
//   - GRACEFUL DEGRADATION: if the LLM call fails, times out, or returns
//     garbage, we fall back to a deterministic template summary built from the
//     same structured data. The feature never breaks — it just becomes less
//     eloquent. This is the engineering decision, not the feature.
//   - COST: one call per shift close. Negligible.
//   - LATENCY: 5–15s acceptable; caller shows a loading state.
//
// The ambitious version we rejected (AI demand forecasting) needs weeks of
// historical data the customer doesn't have yet, and a wrong forecast wastes
// real money. Irresponsible on day one.

import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

export interface ShiftStats {
  branchName: string
  openedAt: Date
  closedAt: Date | null
  orderCount: number
  grossTotal: number
  voidCount: number
  cashTotal: number
  posTotal: number
  topItems: { name: string; qty: number; revenue: number }[]
  avgOrderValue: number
  longestOrderMinutes: number | null
  medianOrderMinutes: number | null
}

export async function computeShiftStats(shiftId: string, tenantId: string): Promise<ShiftStats | null> {
  const shift = await db.shift.findFirst({
    where: { id: shiftId, tenantId },
    include: {
      branch: { select: { name: true } },
      orders: {
        include: {
          items: { select: { menuItemId: true, quantity: true, unitPrice: true, status: true, menuItem: { select: { name: true } } } },
          payments: { select: { method: true, amount: true } },
        },
      },
    },
  })
  if (!shift) return null

  const closedOrders = shift.orders.filter((o) => o.status === 'CLOSED')
  const voided = shift.orders.filter((o) => o.status === 'VOIDED')
  const grossTotal = closedOrders.reduce((s, o) => s + o.total, 0)

  const cashTotal = closedOrders.reduce(
    (s, o) => s + o.payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + p.amount, 0),
    0,
  )
  const posTotal = closedOrders.reduce(
    (s, o) => s + o.payments.filter((p) => p.method === 'POS').reduce((a, p) => a + p.amount, 0),
    0,
  )

  // Aggregate item sales.
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const o of closedOrders) {
    for (const it of o.items) {
      if (it.status === 'CANCELLED') continue
      const key = it.menuItemId
      const existing = itemMap.get(key) ?? { name: it.menuItem.name, qty: 0, revenue: 0 }
      existing.qty += it.quantity
      existing.revenue += it.unitPrice * it.quantity
      itemMap.set(key, existing)
    }
  }
  const topItems = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5)

  const avgOrderValue = closedOrders.length ? Math.round(grossTotal / closedOrders.length) : 0

  // Order duration stats (createdAt → closedAt).
  const durationsMin = closedOrders
    .filter((o) => o.closedAt)
    .map((o) => (o.closedAt!.getTime() - o.createdAt.getTime()) / 60000)
    .sort((a, b) => a - b)
  const longestOrderMinutes = durationsMin.length ? Math.round(durationsMin[durationsMin.length - 1]) : null
  const medianOrderMinutes = durationsMin.length
    ? Math.round(durationsMin[Math.floor(durationsMin.length / 2)])
    : null

  return {
    branchName: shift.branch.name,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    orderCount: closedOrders.length,
    grossTotal,
    voidCount: voided.length,
    cashTotal,
    posTotal,
    topItems,
    avgOrderValue,
    longestOrderMinutes,
    medianOrderMinutes,
  }
}

// Build the structured, injection-safe context we hand the LLM. NO free text.
function buildPromptContext(stats: ShiftStats): string {
  const top = stats.topItems
    .map((t, i) => `${i + 1}. ${t.name} — ${t.qty} sold (${t.revenue.toLocaleString()} Toman)`)
    .join('\n')
  return [
    `Branch: ${stats.branchName}`,
    `Shift window: ${stats.openedAt.toISOString()} → ${stats.closedAt?.toISOString() ?? 'open'}`,
    `Orders closed: ${stats.orderCount}`,
    `Orders voided: ${stats.voidCount}`,
    `Gross revenue: ${stats.grossTotal.toLocaleString()} Toman`,
    `Cash: ${stats.cashTotal.toLocaleString()} Toman | POS: ${stats.posTotal.toLocaleString()} Toman`,
    `Average order value: ${stats.avgOrderValue.toLocaleString()} Toman`,
    `Longest check: ${stats.longestOrderMinutes ?? 'n/a'} min | Median: ${stats.medianOrderMinutes ?? 'n/a'} min`,
    `Top items:\n${top || '(none)'}`,
  ].join('\n')
}

const SYSTEM_PROMPT = `You are a concise restaurant shift reporter for an Iranian restaurant owner.
You receive STRUCTURED shift data (numbers and dish names only). Produce a short, plain-language shift summary in English with:
- 2-3 sentences on how the shift went (revenue, order count, cash/POS split).
- The top 2 items by quantity.
- ONE anomaly or notable observation (e.g. slow check, void, or lopsided cash/POS).
- ONE concrete, low-risk suggestion for the next shift.
Rules:
- Do NOT invent numbers. Use only the provided data.
- Do NOT output markdown, headers, or JSON. Plain prose only.
- Maximum 120 words. No lists.
- If the data is sparse or empty, say so plainly rather than inventing.`

// Sanitize the model output: strip control chars, cap length.
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 1500)
}

// Deterministic fallback summary — used if the LLM fails. Same data, templated.
function deterministicFallback(stats: ShiftStats): string {
  const lines: string[] = []
  lines.push(
    `Shift at ${stats.branchName}: ${stats.orderCount} checks closed for ${stats.grossTotal.toLocaleString()} Toman gross.`,
  )
  const split =
    stats.cashTotal + stats.posTotal > 0
      ? ` Split was ${Math.round((stats.cashTotal / Math.max(1, stats.cashTotal + stats.posTotal)) * 100)}% cash / ${Math.round((stats.posTotal / Math.max(1, stats.cashTotal + stats.posTotal)) * 100)}% POS.`
      : ''
  lines[0] += split
  if (stats.topItems.length >= 2) {
    lines.push(`Top sellers were ${stats.topItems[0].name} (${stats.topItems[0].qty}) and ${stats.topItems[1].name} (${stats.topItems[1].qty}).`)
  } else if (stats.topItems.length === 1) {
    lines.push(`Top seller was ${stats.topItems[0].name} (${stats.topItems[0].qty}).`)
  }
  if (stats.voidCount > 0) lines.push(`${stats.voidCount} order(s) were voided — review why.`)
  if (stats.longestOrderMinutes !== null && stats.medianOrderMinutes !== null) {
    if (stats.longestOrderMinutes > stats.medianOrderMinutes * 1.8) {
      lines.push(`Notable: the longest check sat ${stats.longestOrderMinutes} min vs a ${stats.medianOrderMinutes} min median — kitchen may have been backed up.`)
    }
  }
  lines.push('Suggestion: review item-level timings before the next peak to spot bottlenecks.')
  return lines.join(' ')
}

export interface SummaryResult {
  summary: string
  model: string
  source: 'ai' | 'fallback'
  stats: ShiftStats
}

// Generate a shift summary. Always returns a result — never throws.
// Falls back to deterministic template on any AI failure.
export async function generateShiftSummary(shiftId: string, tenantId: string): Promise<SummaryResult | null> {
  const stats = await computeShiftStats(shiftId, tenantId)
  if (!stats) return null

  const context = buildPromptContext(stats)
  const aiTimeoutMs = 20000

  try {
    const zai = await ZAI.create()
    // Race the LLM against a hard timeout. We never let the caller hang.
    const response = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Shift data:\n${context}` },
        ],
        // Keep temperature low for factual reporting.
        temperature: 0.4,
        max_tokens: 300,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), aiTimeoutMs),
      ),
    ])

    const raw = response?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string' || raw.trim().length < 20) {
      throw new Error('AI_EMPTY_OR_INVALID')
    }
    const clean = sanitize(raw)
    if (clean.length < 20) throw new Error('AI_SANITIZED_EMPTY')

    return {
      summary: clean,
      model: response?.model ?? 'unknown',
      source: 'ai',
      stats,
    }
  } catch (err) {
    // Graceful degradation — the feature must never break the shift close.
    console.log(
      JSON.stringify({
        level: 'warn',
        event: 'ai_summary_fallback',
        shiftId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    )
    return {
      summary: deterministicFallback(stats),
      model: 'deterministic-fallback',
      source: 'fallback',
      stats,
    }
  }
}

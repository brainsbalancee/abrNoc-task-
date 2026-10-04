// Audit log helper. Tamper-evident trail of sensitive actions.
import { db } from '@/lib/db'

export async function audit(opts: {
  tenantId: string
  userId?: string
  action: string
  targetId?: string
  detail?: Record<string, unknown>
}) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId ?? null,
        action: opts.action,
        targetId: opts.targetId ?? null,
        detail: opts.detail ? JSON.stringify(opts.detail) : null,
      },
    })
  } catch (e) {
    // Audit failure must not break the business transaction.
    console.log(
      JSON.stringify({
        level: 'error',
        event: 'audit_failed',
        action: opts.action,
        error: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      }),
    )
  }
}

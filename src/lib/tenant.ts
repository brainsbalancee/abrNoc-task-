// Tenant context + scoped data access.
//
// THE HARD RULE: every database read/write of tenant-scoped data MUST go
// through `scoped()` or `requireTenant()`. There is no unscoped path. A query
// missing the tenant filter is a bug, and we lint for it structurally by
// convention (all repository modules import from here).
//
// This file is the single chokepoint that guarantees Restaurant A can never
// reach Restaurant B's data. If you are reviewing security, read this file.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export interface TenantContext {
  tenantId: string        // the Restaurant id — the isolation key
  branchIds: string[]     // branches the user may see (empty = all in tenant, for MANAGER)
  role: string
  userId: string
  userName: string
  // A specific branch the user is currently operating in. Staff UIs are
  // branch-scoped (the waiter is *at* branch X). Manager can switch.
  activeBranchId: string | null
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
    this.name = 'AuthError'
  }
}

// Resolve the tenant context from the session. Throws AuthError if unauthenticated.
export async function requireTenant(): Promise<TenantContext> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new AuthError('Not authenticated', 401)
  }
  const u = session.user as {
    id: string
    tenantId: string
    role: string
    name: string
    branchIds: string[]
    activeBranchId: string | null
  }
  if (!u.tenantId) {
    throw new AuthError('Session missing tenantId', 401)
  }
  return {
    tenantId: u.tenantId,
    branchIds: u.branchIds ?? [],
    role: u.role,
    userId: u.id,
    userName: u.name,
    activeBranchId: u.activeBranchId,
  }
}

// Require a capability within the tenant context. Throws 403 on denial.
export async function requireTenantCapability(
  capability: Parameters<typeof import('@/lib/roles').can>[1],
): Promise<TenantContext> {
  const ctx = await requireTenant()
  // Lazy import to avoid circular dep
  const { can } = await import('@/lib/roles')
  if (!can(ctx.role, capability as any)) {
    throw new AuthError(`Role ${ctx.role} lacks capability ${capability}`, 403)
  }
  return ctx
}

// Branch access check: a user may only touch data in branches they belong to
// (or, for MANAGER, any branch in their tenant).
export async function requireBranch(branchId: string): Promise<TenantContext> {
  const ctx = await requireTenant()
  if (ctx.role === 'MANAGER') {
    // Manager can access any branch in their tenant — but we still must
    // VERIFY the branch belongs to this tenant. This is the IDOR defence.
    const branch = await db.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!branch) {
      throw new AuthError('Branch not found in your tenant', 404)
    }
    return { ...ctx, activeBranchId: branchId }
  }
  if (!ctx.branchIds.includes(branchId)) {
    throw new AuthError('You are not assigned to this branch', 403)
  }
  return { ...ctx, activeBranchId: branchId }
}

// Verify an order belongs to the caller's tenant AND (for non-managers) to a
// branch they may see. Used at the top of every order mutation endpoint.
export async function requireOrderAccess(
  orderId: string,
): Promise<{ ctx: TenantContext; order: { id: string; tenantId: string; branchId: string } }> {
  const ctx = await requireTenant()
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
    select: { id: true, tenantId: true, branchId: true },
  })
  if (!order) {
    // 404 not 403 — don't leak existence of other tenants' orders.
    throw new AuthError('Order not found', 404)
  }
  if (ctx.role !== 'MANAGER' && !ctx.branchIds.includes(order.branchId)) {
    throw new AuthError('Order is not in your branch', 403)
  }
  return { ctx, order }
}

// Structured logger for security-relevant events. 3am-friendly: one line,
// parseable, includes tenant + user + action + target.
export function logSecurity(
  event: string,
  ctx: Pick<TenantContext, 'tenantId' | 'userId' | 'role'>,
  detail?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({
      level: 'security',
      event,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
      ts: new Date().toISOString(),
      ...detail,
    }),
  )
}

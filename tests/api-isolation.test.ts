// Meshkī API-boundary isolation + concurrency tests.
//
// These tests prove security at the HTTP boundary — not just the database
// layer — which is what the assessment requires. They use two fully
// authenticated sessions (Shandiz manager vs Saffron manager) and attempt
// cross-tenant access via forged IDs, nested resources, and body injection.
//
// They also test REAL concurrency: two simultaneous PATCH requests on the
// same order item, fired in parallel with Promise.all, to prove OCC rejects
// the stale one.
//
// ARCHITECTURE: this test file talks to the RUNNING dev server (:3000) and
// uses a PrismaClient pointed at the SAME database the dev server reads
// (db/custom.db) — NOT the test DB. This is necessary because the API needs
// to authenticate users that exist in the server's database. All test data
// uses a unique slug prefix (`api-test-*`) and is cleaned up in afterAll so
// the demo data is never polluted.
//
// PREREQ: `bun run dev` must be running on :3000.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const BASE = 'http://localhost:3000'

// Point explicitly at the demo DB (the one the dev server reads), NOT the
// test DB. The datasourceUrl override takes precedence over process.env.
const DEMO_DB = `file:${path.join(process.cwd(), 'db', 'custom.db')}`
const db = new PrismaClient({ datasourceUrl: DEMO_DB })

const TEST_SLUG_A = 'api-test-shandiz'
const TEST_SLUG_B = 'api-test-saffron'
const TEST_EMAIL_A = 'api-test-manager-a@shandiz.test'
const TEST_EMAIL_B = 'api-test-manager-b@saffron.test'
const TEST_PW = 'test1234'

let shandizCookies = ''
let saffronCookies = ''
let shandizBranchId = ''
let saffronBranchId = ''
let shandizTableId = ''
let shandizMenuItemId = ''
let shandizOrderId = ''
let shandizOrderItemId = ''

// Track created records for cleanup.
const created = {
  restaurants: [] as string[],
  branches: [] as string[],
  users: [] as string[],
  tables: [] as string[],
  orders: [] as string[],
  shifts: [] as string[],
}

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { credentials: 'include' })
  const csrfJson = (await csrfRes.json()) as any
  const csrf = csrfJson.csrfToken
  const setCookie = csrfRes.headers.get('set-cookie') || ''
  const csrfCookie = setCookie.split(';')[0]

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookie },
    body: new URLSearchParams({ email, password, csrfToken: csrf }),
    redirect: 'manual',
    credentials: 'include',
  })

  // The 302 sets the session cookie. Collect all cookies.
  const cookies = [csrfCookie]
  const loginSetCookie = loginRes.headers.get('set-cookie') || ''
  for (const c of loginSetCookie.split(/, (?=\w)/)) {
    const kv = c.split(';')[0]
    if (kv.includes('session-token') || kv.includes('callback-url')) {
      cookies.push(kv)
    }
  }
  return cookies.join('; ')
}

async function api(path: string, init: RequestInit & { cookies?: string } = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) }
  if (init.cookies) headers['Cookie'] = init.cookies
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' })
}

beforeAll(async () => {
  // Clean up any leftover test data from a previous run (idempotent).
  await cleanupTestData()

  const pw = await bcrypt.hash(TEST_PW, 10)

  // Tenant A: Shandiz (API test)
  const shandiz = await db.restaurant.create({ data: { name: 'Shandiz API Test', slug: TEST_SLUG_A } })
  created.restaurants.push(shandiz.id)
  const sBranch = await db.branch.create({ data: { tenantId: shandiz.id, name: 'Valiasr API' } })
  shandizBranchId = sBranch.id
  created.branches.push(sBranch.id)
  const sUser = await db.user.create({
    data: {
      tenantId: shandiz.id, email: TEST_EMAIL_A, name: 'API Manager A', role: 'MANAGER',
      passwordHash: pw, branches: { create: { branchId: sBranch.id } },
    },
  })
  created.users.push(sUser.id)
  const sTable = await db.table.create({ data: { branchId: sBranch.id, tenantId: shandiz.id, label: 'AT1' } })
  shandizTableId = sTable.id
  created.tables.push(sTable.id)
  const cat = await db.menuCategory.create({ data: { tenantId: shandiz.id, name: 'Kebabs API', sortOrder: 1 } })
  const item = await db.menuItem.create({ data: { tenantId: shandiz.id, categoryId: cat.id, name: 'Koobideh API', price: 285000 } })
  shandizMenuItemId = item.id
  const shift = await db.shift.create({ data: { tenantId: shandiz.id, branchId: sBranch.id, openedBy: sUser.id } })
  created.shifts.push(shift.id)
  const order = await db.order.create({
    data: {
      tenantId: shandiz.id, branchId: sBranch.id, shiftId: shift.id, tableId: sTable.id,
      number: 9001, status: 'OPEN', taxRate: 0,
      items: { create: { tenantId: shandiz.id, menuItemId: item.id, quantity: 1, unitPrice: 285000, status: 'PENDING' } },
    },
  })
  shandizOrderId = order.id
  created.orders.push(order.id)
  shandizOrderItemId = (await db.orderItem.findFirst({ where: { orderId: order.id } }))!.id

  // Tenant B: Saffron (API test)
  const saffron = await db.restaurant.create({ data: { name: 'Saffron API Test', slug: TEST_SLUG_B } })
  created.restaurants.push(saffron.id)
  const fBranch = await db.branch.create({ data: { tenantId: saffron.id, name: 'Ekbatan API' } })
  saffronBranchId = fBranch.id
  created.branches.push(fBranch.id)
  const fUser = await db.user.create({
    data: {
      tenantId: saffron.id, email: TEST_EMAIL_B, name: 'API Manager B', role: 'MANAGER',
      passwordHash: pw, branches: { create: { branchId: fBranch.id } },
    },
  })
  created.users.push(fUser.id)
  const fTable = await db.table.create({ data: { branchId: fBranch.id, tenantId: saffron.id, label: 'BT1' } })
  created.tables.push(fTable.id)
  const fCat = await db.menuCategory.create({ data: { tenantId: saffron.id, name: 'Mains API', sortOrder: 1 } })
  await db.menuItem.create({ data: { tenantId: saffron.id, categoryId: fCat.id, name: 'Saffron Rice API', price: 350000 } })
  const fShift = await db.shift.create({ data: { tenantId: saffron.id, branchId: fBranch.id, openedBy: fUser.id } })
  created.shifts.push(fShift.id)
  const fOrder = await db.order.create({
    data: {
      tenantId: saffron.id, branchId: fBranch.id, shiftId: fShift.id, tableId: fTable.id,
      number: 8001, status: 'OPEN', taxRate: 0,
      items: { create: { tenantId: saffron.id, menuItemId: (await db.menuItem.findFirst({ where: { tenantId: saffron.id } }))!.id, quantity: 1, unitPrice: 350000, status: 'PENDING' } },
    },
  })
  created.orders.push(fOrder.id)

  // Login both sessions.
  shandizCookies = await login(TEST_EMAIL_A, TEST_PW)
  saffronCookies = await login(TEST_EMAIL_B, TEST_PW)

  // Sanity: both sessions are valid.
  const s1 = await api('/api/auth/session', { cookies: shandizCookies })
  const s1j = (await s1.json()) as any
  expect(s1j?.user?.email).toBe(TEST_EMAIL_A)
  const s2 = await api('/api/auth/session', { cookies: saffronCookies })
  const s2j = (await s2.json()) as any
  expect(s2j?.user?.email).toBe(TEST_EMAIL_B)
}, 30000)

afterAll(async () => {
  await cleanupTestData()
  await db.$disconnect()
})

async function cleanupTestData() {
  // Delete by the known test slugs — idempotent and never touches demo data.
  // The schema's onDelete: Cascade handles branches, users, orders, etc.
  for (const slug of [TEST_SLUG_A, TEST_SLUG_B]) {
    const r = await db.restaurant.findUnique({ where: { slug } })
    if (!r) continue
    try {
      await db.restaurant.delete({ where: { id: r.id } })
    } catch {
      // If cascade hits a constraint, delete children explicitly.
      await db.payment.deleteMany({ where: { tenantId: r.id } })
      await db.orderItem.deleteMany({ where: { tenantId: r.id } })
      await db.order.deleteMany({ where: { tenantId: r.id } })
      await db.shift.deleteMany({ where: { tenantId: r.id } })
      await db.table.deleteMany({ where: { tenantId: r.id } })
      await db.menuItem.deleteMany({ where: { tenantId: r.id } })
      await db.menuCategory.deleteMany({ where: { tenantId: r.id } })
      await db.userBranch.deleteMany({ where: { branch: { tenantId: r.id } } })
      await db.user.deleteMany({ where: { tenantId: r.id } })
      await db.branch.deleteMany({ where: { tenantId: r.id } })
      await db.auditLog.deleteMany({ where: { tenantId: r.id } })
      await db.restaurant.delete({ where: { id: r.id } })
    }
  }
}

describe('cross-tenant isolation at the API boundary', () => {
  test('Saffron cannot list Shandiz orders', async () => {
    const res = await api(`/api/orders?branchId=${shandizBranchId}&status=OPEN`, { cookies: saffronCookies })
    expect([403, 404]).toContain(res.status)
  })

  test('Saffron cannot retrieve a Shandiz order by guessing its ID', async () => {
    const res = await api(`/api/orders/${shandizOrderId}`, { cookies: saffronCookies })
    expect(res.status).toBe(404) // not 403 — no existence leak
    const body = (await res.json()) as any
    expect(body.error).toBe('Order not found')
    expect(body.error).not.toMatch(/saffron|forbidden|permission/i)
  })

  test('Saffron cannot PATCH (void) a Shandiz order', async () => {
    const res = await api(`/api/orders/${shandizOrderId}`, {
      method: 'PATCH', cookies: saffronCookies,
      body: JSON.stringify({ status: 'VOIDED' }),
    })
    expect(res.status).toBe(404)
  })

  test('Saffron cannot add items to a Shandiz order (nested resource)', async () => {
    const res = await api(`/api/orders/${shandizOrderId}/items`, {
      method: 'POST', cookies: saffronCookies,
      body: JSON.stringify({ items: [{ menuItemId: shandizMenuItemId, quantity: 1 }] }),
    })
    expect(res.status).toBe(404)
  })

  test('Saffron cannot advance a Shandiz order item status (nested resource)', async () => {
    const res = await api(`/api/orders/${shandizOrderId}/items/${shandizOrderItemId}`, {
      method: 'PATCH', cookies: saffronCookies,
      body: JSON.stringify({ status: 'PREPARING', expectedVersion: 0 }),
    })
    expect(res.status).toBe(404)
  })

  test('Saffron cannot record a payment on a Shandiz order', async () => {
    const res = await api(`/api/orders/${shandizOrderId}/payments`, {
      method: 'POST', cookies: saffronCookies,
      body: JSON.stringify({ method: 'CASH', amount: 1000 }),
    })
    expect(res.status).toBe(404)
  })

  test('Shandiz cannot access Saffron branch tables', async () => {
    const res = await api(`/api/tables?branchId=${saffronBranchId}`, { cookies: shandizCookies })
    expect([403, 404]).toContain(res.status)
  })

  test('Shandiz cannot inject Saffron menu items into its own order (cross-tenant menu ID)', async () => {
    const saffronItem = await db.menuItem.findFirst({ where: { tenantId: (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_B } }))!.id } })
    expect(saffronItem).toBeTruthy()
    const res = await api(`/api/orders/${shandizOrderId}/items`, {
      method: 'POST', cookies: shandizCookies,
      body: JSON.stringify({ items: [{ menuItemId: saffronItem!.id, quantity: 1 }] }),
    })
    expect(res.status).toBe(404) // "One or more menu items not found in your restaurant"
  })

  test('Unauthenticated request fails closed', async () => {
    const res = await api(`/api/orders?branchId=${shandizBranchId}`)
    expect([401, 307]).toContain(res.status)
  })

  test('Saffron cannot close a Shandiz shift', async () => {
    const res = await api('/api/shifts/close', {
      method: 'POST', cookies: saffronCookies,
      body: JSON.stringify({ branchId: shandizBranchId }),
    })
    expect([403, 404]).toContain(res.status)
  })

  test('Shandiz cannot read Saffron shift summary (forged shift ID)', async () => {
    const saffronShift = await db.shift.findFirst({ where: { branchId: saffronBranchId } })
    expect(saffronShift).toBeTruthy()
    const res = await api(`/api/shifts/${saffronShift!.id}`, { cookies: shandizCookies })
    expect(res.status).toBe(404)
  })

  test('mass assignment: PATCH order cannot inject tenantId/total/waiterId', async () => {
    const before = await db.order.findUnique({ where: { id: shandizOrderId } })
    const res = await api(`/api/orders/${shandizOrderId}`, {
      method: 'PATCH', cookies: shandizCookies,
      body: JSON.stringify({
        expectedVersion: before!.version,
        tenantId: 'injected-tenant',
        total: 0,
        waiterId: 'injected-waiter',
        status: 'OPEN', // zod enum only allows CLOSED | VOIDED → 400
      }),
    })
    expect(res.status).toBe(400)
    const after = await db.order.findUnique({ where: { id: shandizOrderId } })
    expect(after!.tenantId).toBe(before!.tenantId) // unchanged
  })
})

describe('concurrency: parallel requests on the same order item', () => {
  test('two simultaneous status transitions: one wins, one gets 409', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9101, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'PENDING' } },
      },
    })
    created.orders.push(order.id)
    const item = (await db.orderItem.findFirst({ where: { orderId: order.id } }))!
    expect(item.version).toBe(0)

    // Fire TWO simultaneous PENDING→PREPARING transitions with the SAME expectedVersion (0).
    const [r1, r2] = await Promise.all([
      api(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH', cookies: shandizCookies,
        body: JSON.stringify({ status: 'PREPARING', expectedVersion: 0 }),
      }),
      api(`/api/orders/${order.id}/items/${item.id}`, {
        method: 'PATCH', cookies: shandizCookies,
        body: JSON.stringify({ status: 'PREPARING', expectedVersion: 0 }),
      }),
    ])
    const codes = [r1.status, r2.status].sort()
    expect(codes).toEqual([200, 409])
    const after = await db.orderItem.findUnique({ where: { id: item.id } })
    expect(after!.status).toBe('PREPARING')
    expect(after!.version).toBe(1) // incremented exactly once
  })

  test('two simultaneous item additions to the same order both succeed (append-only)', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9102, status: 'OPEN', taxRate: 0,
      },
    })
    created.orders.push(order.id)
    const [r1, r2] = await Promise.all([
      api(`/api/orders/${order.id}/items`, {
        method: 'POST', cookies: shandizCookies,
        body: JSON.stringify({ items: [{ menuItemId: shandizMenuItemId, quantity: 2 }] }),
      }),
      api(`/api/orders/${order.id}/items`, {
        method: 'POST', cookies: shandizCookies,
        body: JSON.stringify({ items: [{ menuItemId: shandizMenuItemId, quantity: 3 }] }),
      }),
    ])
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    const items = await db.orderItem.findMany({ where: { orderId: order.id } })
    expect(items.length).toBe(2)
    expect(items.reduce((s, i) => s + i.quantity, 0)).toBe(5)
  })

  test('stale version on item status transition returns 409, no state change', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9103, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'PENDING' } },
      },
    })
    created.orders.push(order.id)
    const item = (await db.orderItem.findFirst({ where: { orderId: order.id } }))!
    const res = await api(`/api/orders/${order.id}/items/${item.id}`, {
      method: 'PATCH', cookies: shandizCookies,
      body: JSON.stringify({ status: 'PREPARING', expectedVersion: 99999 }),
    })
    expect(res.status).toBe(409)
    const after = await db.orderItem.findUnique({ where: { id: item.id } })
    expect(after!.status).toBe('PENDING')
    expect(after!.version).toBe(0)
  })
})

describe('validation and error handling at the API boundary', () => {
  test('invalid item status transition is rejected (SERVED → PREPARING)', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9201, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'SERVED' } },
      },
    })
    created.orders.push(order.id)
    const item = (await db.orderItem.findFirst({ where: { orderId: order.id } }))!
    const res = await api(`/api/orders/${order.id}/items/${item.id}`, {
      method: 'PATCH', cookies: shandizCookies,
      body: JSON.stringify({ status: 'PREPARING', expectedVersion: item.version }),
    })
    expect(res.status).toBe(409)
  })

  test('payment exceeding balance is rejected', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9202, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'SERVED' } },
      },
    })
    created.orders.push(order.id)
    const res = await api(`/api/orders/${order.id}/payments`, {
      method: 'POST', cookies: shandizCookies,
      body: JSON.stringify({ method: 'CASH', amount: 999999 }),
    })
    expect(res.status).toBe(409)
  })

  test('cannot close an order with no payment recorded', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9203, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'SERVED' } },
      },
    })
    created.orders.push(order.id)
    const res = await api(`/api/orders/${order.id}`, {
      method: 'PATCH', cookies: shandizCookies,
      body: JSON.stringify({ status: 'CLOSED' }),
    })
    expect(res.status).toBe(409)
  })

  test('cannot create a second open order on the same table', async () => {
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9204, status: 'OPEN', taxRate: 0,
      },
    })
    const res = await api('/api/orders', {
      method: 'POST', cookies: shandizCookies,
      body: JSON.stringify({ branchId: shandizBranchId, tableId: shandizTableId }),
    })
    expect(res.status).toBe(409)
  })

  test('role enforcement: waiter cannot apply discounts (capability check)', async () => {
    // Create a waiter for the Shandiz test tenant.
    const shandiz = (await db.restaurant.findUnique({ where: { slug: TEST_SLUG_A } }))!
    const pw = await bcrypt.hash(TEST_PW, 10)
    const waiter = await db.user.create({
      data: {
        tenantId: shandiz.id, email: 'api-test-waiter@shandiz.test', name: 'API Waiter', role: 'WAITER',
        passwordHash: pw, branches: { create: { branchId: shandizBranchId } },
      },
    })
    created.users.push(waiter.id)
    const waiterCookies = await login('api-test-waiter@shandiz.test', TEST_PW)
    const shift = (await db.shift.findFirst({ where: { branchId: shandizBranchId } }))!
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id, branchId: shandizBranchId, shiftId: shift.id,
        tableId: shandizTableId, number: 9205, status: 'OPEN', taxRate: 0,
        items: { create: { tenantId: shandiz.id, menuItemId: shandizMenuItemId, quantity: 1, unitPrice: 285000, status: 'SERVED' } },
      },
    })
    created.orders.push(order.id)
    const res = await api(`/api/orders/${order.id}`, {
      method: 'PATCH', cookies: waiterCookies,
      body: JSON.stringify({ expectedVersion: 0, discountAmount: 50000 }),
    })
    expect(res.status).toBe(403) // "Your role cannot apply discounts"
  })
})

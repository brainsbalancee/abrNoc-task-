// Meshkī seed — realistic Iranian restaurant demo data.
//
// Two tenants (restaurants) so the cross-tenant isolation test has teeth.
// Shandiz Garden is the "main" demo restaurant with two branches and a rich
// Persian menu. Saffron House is a smaller second tenant we must never reach.
//
// Run: bun run prisma/seed.ts  (or: bun run db:seed)
//
// Demo credentials (all passwords: "demo1234"):
//   manager@shandiz.test    MANAGER   — full access, both Shandiz branches
//   waiter1@shandiz.test    WAITER    — Valiasr branch
//   waiter2@shandiz.test    WAITER    — Valiasr branch
//   waiter3@shandiz.test    WAITER    — Saadat Abad branch
//   kitchen@shandiz.test    KITCHEN   — Valiasr branch
//   cashier@shandiz.test   CASHIER   — Valiasr branch
//   manager@saffron.test    MANAGER   — second tenant (for isolation tests)
//   waiter@saffron.test     WAITER    — second tenant

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()
const DEMO_PASSWORD = 'demo1234'

async function main() {
  console.log('Seeding…')
  // Reset — idempotent re-runs. Order matters for FK constraints.
  await db.payment.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.shift.deleteMany()
  await db.auditLog.deleteMany()
  await db.table.deleteMany()
  await db.menuItem.deleteMany()
  await db.menuCategory.deleteMany()
  await db.userBranch.deleteMany()
  await db.user.deleteMany()
  await db.branch.deleteMany()
  await db.restaurant.deleteMany()

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  // ── Restaurant 1: Shandiz Garden ──────────────────────────────────────────
  const shandiz = await db.restaurant.create({
    data: { name: 'Shandiz Garden', slug: 'shandiz' },
  })

  const valiasr = await db.branch.create({
    data: {
      tenantId: shandiz.id,
      name: 'Valiasr (Main)',
      address: 'Valiasr St, Tehran',
      taxRate: 0, // tax-inclusive by Iranian norm
    },
  })
  const saadat = await db.branch.create({
    data: {
      tenantId: shandiz.id,
      name: 'Saadat Abad',
      address: 'Saadat Abad, Tehran',
      taxRate: 0,
    },
  })

  // ── Staff for Shandiz ──────────────────────────────────────────────────────
  const shandizStaff = [
    { email: 'manager@shandiz.test', name: 'Ali Rezaei', role: 'MANAGER', branches: [valiasr.id, saadat.id] },
    { email: 'waiter1@shandiz.test', name: 'Mohammad', role: 'WAITER', branches: [valiasr.id] },
    { email: 'waiter2@shandiz.test', name: 'Sara', role: 'WAITER', branches: [valiasr.id] },
    { email: 'waiter3@shandiz.test', name: 'Zahra', role: 'WAITER', branches: [saadat.id] },
    { email: 'kitchen@shandiz.test', name: 'Reza (Chef)', role: 'KITCHEN', branches: [valiasr.id] },
    { email: 'cashier@shandiz.test', name: 'Fatemeh', role: 'CASHIER', branches: [valiasr.id] },
  ]
  for (const s of shandizStaff) {
    const u = await db.user.create({
      data: {
        tenantId: shandiz.id,
        email: s.email,
        name: s.name,
        role: s.role,
        passwordHash,
        branches: { create: s.branches.map((branchId) => ({ branchId })) },
      },
    })
    console.log(`  user: ${u.email} (${u.role})`)
  }

  // ── Menu (tenant-scoped, shared by both Shandiz branches) ───────────────────
  const categories: { name: string; sortOrder: number; items: { name: string; nameFa: string; price: number; station?: string }[] }[] = [
    {
      name: 'Kebabs', sortOrder: 1,
      items: [
        { name: 'Chelo Kebab Koobideh', nameFa: 'چلو کباب کوبیده', price: 285000, station: 'grill' },
        { name: 'Chelo Kebab Barg', nameFa: 'چلو کباب برگ', price: 420000, station: 'grill' },
        { name: 'Kebab Soltani', nameFa: 'کباب سلطانی', price: 640000, station: 'grill' },
        { name: 'Joojeh Kebab', nameFa: 'جوجه کباب', price: 320000, station: 'grill' },
        { name: 'Chenjeh', nameFa: 'چنجه', price: 580000, station: 'grill' },
        { name: 'Kebab Torsh', nameFa: 'کباب ترش', price: 460000, station: 'grill' },
      ],
    },
    {
      name: 'Stews (Khoresht)', sortOrder: 2,
      items: [
        { name: 'Ghormeh Sabzi', nameFa: 'قورمه سبزی', price: 240000, station: 'kitchen' },
        { name: 'Gheimeh', nameFa: 'قیمه', price: 240000, station: 'kitchen' },
        { name: 'Fesenjan', nameFa: 'فسنجان', price: 320000, station: 'kitchen' },
        { name: 'Khoresht Bademjan', nameFa: 'خورشت بادمجان', price: 260000, station: 'kitchen' },
      ],
    },
    {
      name: 'Rice Dishes (Polo)', sortOrder: 3,
      items: [
        { name: 'Zereshk Polo with Chicken', nameFa: 'زرشک پلو با مرغ', price: 290000, station: 'kitchen' },
        { name: 'Baghali Polo', nameFa: 'باقالی پلو', price: 310000, station: 'kitchen' },
        { name: 'Adas Polo', nameFa: 'عدس پلو', price: 220000, station: 'kitchen' },
        { name: 'Tahchin Morgh', nameFa: 'ته چین مرغ', price: 340000, station: 'kitchen' },
      ],
    },
    {
      name: 'Appetizers', sortOrder: 4,
      items: [
        { name: 'Mirza Ghasemi', nameFa: 'میرزا قاسمی', price: 165000, station: 'cold' },
        { name: 'Kashk-e Bademjan', nameFa: 'کشک بادمجان', price: 155000, station: 'cold' },
        { name: 'Sabzi Khordan', nameFa: 'سبزی خوردن', price: 45000, station: 'cold' },
        { name: 'Mast-o-Moosir', nameFa: 'ماست و موسیر', price: 75000, station: 'cold' },
        { name: 'Salad Shirazi', nameFa: 'سالاد شیرازی', price: 85000, station: 'cold' },
      ],
    },
    {
      name: 'Drinks', sortOrder: 5,
      items: [
        { name: 'Doogh (Abali)', nameFa: 'دوغ آب‌علی', price: 45000, station: 'bar' },
        { name: 'Black Tea (Chai)', nameFa: 'چای', price: 35000, station: 'bar' },
        { name: 'Saffron Tea', nameFa: 'دم‌نوش زعفرانی', price: 65000, station: 'bar' },
        { name: 'Sharbat Sekanjabin', nameFa: 'شربت سکنجبین', price: 55000, station: 'bar' },
        { name: 'Persian Coffee', nameFa: 'قهوه ترک', price: 85000, station: 'bar' },
        { name: 'Hibiscus Sharbat', nameFa: 'شربت چای ترش', price: 60000, station: 'bar' },
      ],
    },
    {
      name: 'Desserts', sortOrder: 6,
      items: [
        { name: 'Bastani Sonnati (Saffron Ice Cream)', nameFa: 'بستنی سنتی', price: 95000, station: 'cold' },
        { name: 'Faloodeh Shirazi', nameFa: 'فالوده شیرازی', price: 85000, station: 'cold' },
        { name: 'Sholeh Zard', nameFa: 'شله‌زرد', price: 75000, station: 'kitchen' },
        { name: 'Halim', nameFa: 'حلیم', price: 110000, station: 'kitchen' },
      ],
    },
  ]

  const shandizMenuItemIdByName: Record<string, string> = {}
  for (const cat of categories) {
    const c = await db.menuCategory.create({
      data: {
        tenantId: shandiz.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        items: {
          create: cat.items.map((it) => ({
            tenantId: shandiz.id,
            name: it.name,
            nameFa: it.nameFa,
            price: it.price,
            kitchenStation: it.station ?? 'main',
          })),
        },
      },
      include: { items: true },
    })
    for (const it of c.items) shandizMenuItemIdByName[it.name] = it.id
  }
  console.log(`  Shandiz menu: ${Object.keys(shandizMenuItemIdByName).length} items`)

  // Tables for branches
  async function makeTables(branchId: string, count: number) {
    for (let i = 1; i <= count; i++) {
      await db.table.create({
        data: { branchId, tenantId: shandiz.id, label: `T${i}`, seats: i % 3 === 0 ? 6 : 4 },
      })
    }
  }
  await makeTables(valiasr.id, 12)
  await makeTables(saadat.id, 8)

  // ── Shandiz: a CLOSED shift from yesterday with realistic history ──────────
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(11, 0, 0, 0)
  const yesterdayClosed = new Date(yesterday)
  yesterdayClosed.setHours(23, 30, 0, 0)

  const valiasrTables = await db.table.findMany({ where: { branchId: valiasr.id } })
  const managerUser = await db.user.findUnique({ where: { email: 'manager@shandiz.test' } })
  const waiter1 = await db.user.findUnique({ where: { email: 'waiter1@shandiz.test' } })
  const waiter2 = await db.user.findUnique({ where: { email: 'waiter2@shandiz.test' } })

  const closedShift = await db.shift.create({
    data: {
      tenantId: shandiz.id,
      branchId: valiasr.id,
      openedBy: managerUser!.id,
      closedBy: managerUser!.id,
      openedAt: yesterday,
      closedAt: yesterdayClosed,
    },
  })

  // Helper to create a finished order in history
  async function historyOrder(opts: {
    table: typeof valiasrTables[number]
    waiterId: string
    number: number
    items: { name: string; qty: number; notes?: string }[]
    discount?: number
    serviceRate?: number
    paidMethod: 'CASH' | 'POS'
    createdAt: Date
  }) {
    const orderItems = opts.items.map((it) => {
      const menuItemId = shandizMenuItemIdByName[it.name]
      const price = categories.flatMap((c) => c.items).find((x) => x.name === it.name)!.price
      return { menuItemId, quantity: it.qty, unitPrice: price, notes: it.notes, status: 'SERVED', tenantId: shandiz.id }
    })
    const subtotal = orderItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
    const discount = opts.discount ?? 0
    const serviceRate = opts.serviceRate ?? 0
    const taxRate = 0
    const taxable = subtotal - discount
    const service = Math.round((taxable * serviceRate) / 100)
    const tax = Math.round((taxable * taxRate) / 100)
    const total = taxable + service + tax
    const order = await db.order.create({
      data: {
        tenantId: shandiz.id,
        branchId: valiasr.id,
        shiftId: closedShift.id,
        tableId: opts.table.id,
        waiterId: opts.waiterId,
        number: opts.number,
        status: 'CLOSED',
        subtotal,
        discountAmount: discount,
        serviceRate,
        taxRate,
        total,
        createdAt: opts.createdAt,
        closedAt: new Date(opts.createdAt.getTime() + 45 * 60 * 1000),
        items: { create: orderItems },
        payments: {
          create: { tenantId: shandiz.id, method: opts.paidMethod, amount: total },
        },
      },
    })
    return order
  }

  const base = new Date(yesterday)
  base.setHours(12, 0, 0, 0)
  await historyOrder({ number: 1035, table: valiasrTables[0], waiterId: waiter1!.id, createdAt: new Date(base), paidMethod: 'CASH', items: [{ name: 'Chelo Kebab Koobideh', qty: 2 }, { name: 'Doogh (Abali)', qty: 2 }, { name: 'Sabzi Khordan', qty: 1 }] })
  await historyOrder({ number: 1036, table: valiasrTables[1], waiterId: waiter2!.id, createdAt: new Date(base.getTime() + 25 * 60000), paidMethod: 'POS', items: [{ name: 'Kebab Soltani', qty: 1 }, { name: 'Joojeh Kebab', qty: 1 }, { name: 'Saffron Tea', qty: 2 }] })
  await historyOrder({ number: 1037, table: valiasrTables[2], waiterId: waiter1!.id, createdAt: new Date(base.getTime() + 50 * 60000), paidMethod: 'CASH', items: [{ name: 'Ghormeh Sabzi', qty: 2 }, { name: 'Salad Shirazi', qty: 1 }, { name: 'Doogh (Abali)', qty: 2 }] })
  await historyOrder({ number: 1038, table: valiasrTables[3], waiterId: waiter2!.id, createdAt: new Date(base.getTime() + 75 * 60000), paidMethod: 'POS', discount: 50000, serviceRate: 5, items: [{ name: 'Chenjeh', qty: 2 }, { name: 'Mirza Ghasemi', qty: 1 }, { name: 'Persian Coffee', qty: 2 }] })
  await historyOrder({ number: 1039, table: valiasrTables[4], waiterId: waiter1!.id, createdAt: new Date(base.getTime() + 110 * 60000), paidMethod: 'CASH', items: [{ name: 'Zereshk Polo with Chicken', qty: 2 }, { name: 'Mast-o-Moosir', qty: 1 }] })
  await historyOrder({ number: 1040, table: valiasrTables[5], waiterId: waiter2!.id, createdAt: new Date(base.getTime() + 150 * 60000), paidMethod: 'POS', items: [{ name: 'Fesenjan', qty: 1 }, { name: 'Gheimeh', qty: 1 }, { name: 'Sabzi Khordan', qty: 2 }, { name: 'Black Tea (Chai)', qty: 2 }] })
  await historyOrder({ number: 1041, table: valiasrTables[6], waiterId: waiter1!.id, createdAt: new Date(base.getTime() + 200 * 60000), paidMethod: 'CASH', items: [{ name: 'Chelo Kebab Barg', qty: 1 }, { name: 'Chelo Kebab Koobideh', qty: 1 }, { name: 'Bastani Sonnati (Saffron Ice Cream)', qty: 2 }] })
  await historyOrder({ number: 1042, table: valiasrTables[7], waiterId: waiter2!.id, createdAt: new Date(base.getTime() + 240 * 60000), paidMethod: 'POS', serviceRate: 10, items: [{ name: 'Tahchin Morgh', qty: 2 }, { name: 'Faloodeh Shirazi', qty: 2 }, { name: 'Sharbat Sekanjabin', qty: 2 }] })

  // Update the closed shift aggregates (deterministic, server-side)
  const closedOrders = await db.order.findMany({ where: { shiftId: closedShift.id } })
  await db.shift.update({
    where: { id: closedShift.id },
    data: {
      orderCount: closedOrders.length,
      grossTotal: closedOrders.reduce((s, o) => s + o.total, 0),
      voidCount: 0,
    },
  })

  // Generate a REAL AI summary from the seeded shift data (with graceful
  // fallback to deterministic template if the AI provider is unavailable).
  // This keeps the demo honest: the displayed summary matches the data.
  const { generateShiftSummary } = await import('../src/lib/ai-summary')
  const summary = await generateShiftSummary(closedShift.id, shandiz.id)
  if (summary) {
    await db.shift.update({
      where: { id: closedShift.id },
      data: { aiSummary: summary.summary, aiModel: summary.model },
    })
    console.log(`  closed-shift AI summary via ${summary.source}`)
  }

  // ── Shandiz: an OPEN shift for "now" with live orders at mixed statuses ────
  const now = new Date()
  const openShift = await db.shift.create({
    data: {
      tenantId: shandiz.id,
      branchId: valiasr.id,
      openedBy: managerUser!.id,
      openedAt: new Date(now.getTime() - 90 * 60000),
    },
  })

  // Order #1 — table 3, multiple items, kitchen actively cooking
  const o1 = await db.order.create({
    data: {
      tenantId: shandiz.id,
      branchId: valiasr.id,
      shiftId: openShift.id,
      tableId: valiasrTables[2].id,
      waiterId: waiter1!.id,
      number: 1042,
      status: 'OPEN',
      taxRate: 0,
      items: {
        create: [
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Chelo Kebab Koobideh'], quantity: 2, unitPrice: 285000, status: 'PREPARING', notes: 'one well-done' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Doogh (Abali)'], quantity: 2, unitPrice: 45000, status: 'READY' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Sabzi Khordan'], quantity: 1, unitPrice: 45000, status: 'SERVED' },
        ],
      },
    },
  })
  // recompute totals
  await recomputeOrderTotals(o1.id)

  // Order #2 — table 7, just placed, all pending
  const o2 = await db.order.create({
    data: {
      tenantId: shandiz.id,
      branchId: valiasr.id,
      shiftId: openShift.id,
      tableId: valiasrTables[6].id,
      waiterId: waiter2!.id,
      number: 1043,
      status: 'OPEN',
      taxRate: 0,
      items: {
        create: [
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Ghormeh Sabzi'], quantity: 1, unitPrice: 240000, status: 'PENDING' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Gheimeh'], quantity: 1, unitPrice: 240000, status: 'PENDING', notes: 'no bone' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Salad Shirazi'], quantity: 1, unitPrice: 85000, status: 'PENDING' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Black Tea (Chai)'], quantity: 2, unitPrice: 35000, status: 'PENDING' },
        ],
      },
    },
  })
  await recomputeOrderTotals(o2.id)

  // Order #3 — table 1, drinks ready, food cooking
  const o3 = await db.order.create({
    data: {
      tenantId: shandiz.id,
      branchId: valiasr.id,
      shiftId: openShift.id,
      tableId: valiasrTables[0].id,
      waiterId: waiter1!.id,
      number: 1044,
      status: 'OPEN',
      taxRate: 0,
      items: {
        create: [
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Kebab Soltani'], quantity: 1, unitPrice: 640000, status: 'PREPARING' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Mirza Ghasemi'], quantity: 1, unitPrice: 165000, status: 'READY' },
          { tenantId: shandiz.id, menuItemId: shandizMenuItemIdByName['Saffron Tea'], quantity: 2, unitPrice: 65000, status: 'SERVED' },
        ],
      },
    },
  })
  await recomputeOrderTotals(o3.id)

  console.log(`  Shandiz open shift with ${3} live orders`)

  // ── Restaurant 2: Saffron House (smaller, second tenant) ───────────────────
  const saffron = await db.restaurant.create({ data: { name: 'Saffron House', slug: 'saffron' } })
  const ekbatan = await db.branch.create({
    data: { tenantId: saffron.id, name: 'Ekbatan', address: 'Ekbatan, Tehran', taxRate: 0 },
  })
  for (const s of [
    { email: 'manager@saffron.test', name: 'Hossein', role: 'MANAGER', branches: [ekbatan.id] },
    { email: 'waiter@saffron.test', name: 'Maryam', role: 'WAITER', branches: [ekbatan.id] },
  ]) {
    await db.user.create({
      data: {
        tenantId: saffron.id, email: s.email, name: s.name, role: s.role, passwordHash,
        branches: { create: s.branches.map((branchId) => ({ branchId })) },
      },
    })
  }
  // Smaller menu for Saffron — proves tenants are independent
  const cat2 = await db.menuCategory.create({
    data: {
      tenantId: saffron.id, name: 'Mains', sortOrder: 1,
      items: {
        create: [
          { tenantId: saffron.id, name: 'Saffron Chicken Rice', nameFa: 'زرشک پلو زعفرانی', price: 350000 },
          { tenantId: saffron.id, name: 'Herbal Stew', nameFa: 'خورشت سبزی', price: 220000 },
        ],
      },
    },
  })
  await db.table.create({ data: { branchId: ekbatan.id, tenantId: saffron.id, label: 'T1', seats: 4 } })
  await db.table.create({ data: { branchId: ekbatan.id, tenantId: saffron.id, label: 'T2', seats: 2 } })

  console.log('Seed complete.')
}

// Recompute order subtotal/total from its items (server-side source of truth).
async function recomputeOrderTotals(orderId: string) {
  const items = await db.orderItem.findMany({ where: { orderId, status: { not: 'CANCELLED' } } })
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return
  const discount = order.discountAmount
  const taxable = subtotal - discount
  const service = Math.round((taxable * order.serviceRate) / 100)
  const tax = Math.round((taxable * order.taxRate) / 100)
  const total = taxable + service + tax
  await db.order.update({ where: { id: orderId }, data: { subtotal, total } })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

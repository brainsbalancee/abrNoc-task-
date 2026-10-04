# Meshkī — Restaurant Platform

A platform for Iranian cafés and restaurants. Built for the live order lifecycle: waiter → kitchen → cashier, real-time, multi-tenant, role-gated, with a defensible AI shift summary that degrades gracefully.

> **Live demo:** see the Preview Panel (right side of the interface). Click **Open in New Tab** for a full-window view.
>
> **Demo credentials:** all passwords are `demo1234`. One-click login on the `/login` page.

| Role | Email | Notes |
|---|---|---|
| Manager | `manager@shandiz.test` | Full access, both Shandiz branches |
| Waiter | `waiter1@shandiz.test` | Valiasr branch — take orders |
| Kitchen | `kitchen@shandiz.test` | Valiasr — cook display |
| Cashier | `cashier@shandiz.test` | Valiasr — close checks |
| Second tenant | `manager@saffron.test` | Saffron House — for isolation tests |

The demo restaurant is **Shandiz Garden** (two branches, 29-item Persian menu, 6 staff, a closed shift yesterday with a real AI summary, and an open shift today with three live orders at mixed statuses).

---

## What this is

One workflow, finished and defensible: the live order lifecycle.

```
Waiter opens table → adds items (with notes)
        ↓  (real-time over WebSocket)
Kitchen display → marks PREPARING → READY
        ↓  (real-time)
Waiter sees READY → marks SERVED
        ↓
Cashier applies discount/service → records payment (cash or POS) → closes check
        ↓
Manager closes shift → reads an AI-generated plain-language summary
```

- **Real-time concurrency.** Optimistic concurrency control (`version` fields) on order/item mutations; append-only item adds; a state machine for item status. Two waiters, a kitchen, and a cashier can touch the same order without losing each other's work.
- **Hard multi-tenant isolation.** Every tenant-scoped query goes through a single chokepoint (`src/lib/tenant.ts`) that injects `tenantId`. Forged cross-tenant IDs return 404 (not 403, to avoid leaking existence). Proved by an automated test.
- **Four roles, capability-checked.** MANAGER / WAITER / KITCHEN / CASHIER. The API checks capabilities, not role names.
- **One AI capability, defended.** An end-of-shift summary generated from structured data only. If the AI provider fails, a deterministic template fills in. The feature never breaks.

Iran-specific: Toman (integer), cash + local POS terminal tracking (we *record* payments, we don't process card payments — no international rails), tax-inclusive defaults.

---

## Local setup (one command)

Requires **Bun** ≥ 1.3 and **Node** ≥ 20.

```bash
git clone <repo> && cd meshki
bun install        # install dependencies
bun run db:push    # create the SQLite database from the Prisma schema
bun run seed       # seed the demo restaurant(s) — also generates a real AI summary for yesterday's shift
bun run dev        # start the Next.js app on http://localhost:3000
bun run realtime   # in another terminal: start the Socket.io relay on :3003 and internal HTTP on :3004
bun test           # run the 22 integration tests (full workflow + cross-tenant isolation)
```

Then open `http://localhost:3000` and log in with any demo account above.

### Environment

`.env.example` is committed with placeholders. Copy it to `.env` and fill in real values:

```
DATABASE_URL=file:./db/custom.db
NEXTAUTH_SECRET=<random string>
NEXTAUTH_URL=http://localhost:3000
REALTIME_PORT=3003
```

The AI SDK (`z-ai-web-dev-sdk`) reads its credentials from `/etc/.z-ai-config` (server-side, not in the repo). If the AI provider is unreachable, the shift summary falls back to a deterministic template — the feature still works.

### Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Next.js dev server on :3000 |
| `bun run realtime` | Socket.io relay (:3003) + internal HTTP (:3004) with hot reload |
| `bun run lint` | ESLint |
| `bun run db:push` | Push Prisma schema to SQLite |
| `bun run seed` | Seed demo data (idempotent; also generates the AI summary for the closed shift) |
| `bun test` | Integration tests |

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (waiter / kitchen / cashier / manager)             │
│  Next.js App Router · React 19 · shadcn/ui · TanStack Query  │
│  Socket.io-client → wss://…/?XTransformPort=3003             │
└──────────┬───────────────────────────────────┬──────────────┘
           │ HTTPS (REST + NextAuth cookie)     │ WebSocket (JWT-authenticated)
           ▼                                    ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│  Next.js 16 (App Router) │         │  Realtime relay           │
│  - Route handlers (API)  │  POST   │  (mini-services/realtime) │
│  - requireTenant() at    │ ──────► │  - Socket.io on :3003     │
│    every boundary        │ emit    │  - Internal HTTP on :3004 │
│  - OCC via version field │         │  - JWT-verified room join │
│  - z-ai-web-dev-sdk      │         │  - Owns NO business state  │
└──────────┬───────────────┘         └──────────────────────────┘
           ▼
┌──────────────────────────┐
│  SQLite (via Prisma)     │
│  - Restaurant (tenant)    │
│  - Branch / User / Role  │
│  - Menu / Order / Item   │
│  - Payment / Shift / Log │
└──────────────────────────┘
```

### The tenant boundary (the hard guarantee)

`Restaurant` is the tenant. Every tenant-scoped table carries `tenantId`. All data access goes through `src/lib/tenant.ts`:

- `requireTenant()` — returns `{ tenantId, branchIds, role, userId }` from the session, or 401.
- `requireBranch(branchId)` — verifies the branch belongs to the caller's tenant (IDOR defence, even for managers).
- `requireOrderAccess(orderId)` — loads the order scoped by `tenantId`; returns 404 if it doesn't exist in the caller's tenant (not 403 — no existence leak).

There is no unscoped path. A test in `tests/workflow.test.ts` proves Restaurant A cannot read Restaurant B's orders, menu, or branches — including by forging IDs.

### The concurrency model

- `Order` and `OrderItem` have a `version` integer.
- Status mutations use `updateMany({ where: { id, version: expected }, data: { status, version: { increment: 1 } } })`. A stale version yields `count: 0` → HTTP 409.
- Adding items is **append-only** — no version check needed; two concurrent adds both succeed.
- Item status is a **state machine**: `PENDING → PREPARING → READY → SERVED`, plus `PENDING → CANCELLED`. The server rejects illegal transitions with 409. Role-gated: kitchen cooks, waiter serves.
- Order totals are **always recomputed server-side** from items; the client never sends a total.

### The AI capability

`src/lib/ai-summary.ts`:

- Input: structured shift data (counts, totals, dish names, timings). **Never** free-text notes, never customer data.
- Output: plain prose, rendered as text, never executed. Sanitised (control chars stripped, length capped).
- **Graceful degradation:** if the LLM fails, times out, or returns garbage, a deterministic template built from the same data fills in. The feature never breaks — it just becomes less eloquent. The shift close always returns a summary.
- Cost: one LLM call per shift close. Latency: 5–15s, with a 20s hard timeout.
- Prompt-injection surface is minimal because the input is structured. Output is never parsed as instructions.

### The realtime relay

`mini-services/realtime/index.ts`:

- Two HTTP servers in one process: Socket.io on `:3003` (path `/`, per the Caddy gateway rule) and internal HTTP on `:3004` (so engine.io doesn't swallow our routes).
- Browser clients connect with their NextAuth JWT in `socket.handshake.auth.token`. The relay verifies it with `jose` + the shared `NEXTAUTH_SECRET` and **auto-joins** the client to branch rooms for branches in their JWT. The client cannot join arbitrary rooms — server-controlled membership.
- The Next.js API layer POSTs broadcast events to `:3004/internal/broadcast` after a DB commit. The emit is fire-and-forget (realtime is an enhancement; the database is the source of truth). Clients poll on a 5–8s interval as a safety net.

### What's logged (3am-friendly)

One-line JSON, parseable. Levels: `info`, `warn`, `error`, `security`. Every API error gets a correlation id. Auth failures log at `error` (a forged cross-tenant ID is worth seeing at 3am — it's a probe). Query logging is off by default; enable with `DEBUG_QUERIES=1`.

---

## Repo layout

```
├── SCOPE.md            # Engagement-shape document (written before building)
├── DECISIONS.md        # Decision / reason / alternative / trade-off (+ 2 I'd revisit)
├── AI_USAGE.md         # Where AI helped, where it hurt, what I verified
├── HANDOVER.md         # For a non-technical restaurant owner
├── README.md           # This file
├── prisma/
│   ├── schema.prisma   # Domain-driven schema
│   └── seed.ts         # Realistic Iranian restaurant demo data
├── mini-services/
│   └── realtime/       # Socket.io relay (port 3003 + 3004)
├── src/
│   ├── app/
│   │   ├── (app)/      # Authenticated app shell + role views
│   │   │   ├── layout.tsx     # Nav, branch switcher, realtime indicator
│   │   │   ├── page.tsx        # Dashboard (role-aware)
│   │   │   ├── waiter/         # Table grid
│   │   │   ├── kitchen/        # Live ticket board
│   │   │   ├── cashier/        # Open checks + checkout dialog
│   │   │   ├── orders/[id]/    # Shared order detail (add items, advance status)
│   │   │   └── reports/        # Shift summary (AI + fallback)
│   │   ├── login/page.tsx
│   │   └── api/               # Route handlers (every one uses requireTenant)
│   ├── lib/
│   │   ├── auth.ts            # NextAuth config + JWT typing
│   │   ├── tenant.ts          # The isolation chokepoint
│   │   ├── order-state.ts     # State machine + role-gated transitions
│   │   ├── roles.ts           # Capability matrix
│   │   ├── money.ts           # Integer-Toman recompute (server source of truth)
│   │   ├── ai-summary.ts      # AI shift summary + deterministic fallback
│   │   ├── realtime.ts        # Server-side emit (fire-and-forget)
│   │   ├── audit.ts           # Tamper-evident audit log
│   │   └── api-utils.ts       # Error handling, corrId, fail-closed
│   ├── hooks/use-realtime.ts  # Browser Socket.io client (JWT-authenticated)
│   └── components/             # shadcn/ui + Providers
└── tests/
    └── workflow.test.ts       # 22 tests: full workflow + isolation + AI fallback
```

---

## Tests

`bun test` runs 22 integration tests:

- **Full order workflow** (12 tests): create → add items → advance status (OCC) → apply discount → record payment → close → verify every total computed server-side.
- **Cross-tenant isolation** (5 tests): tenant-scoped queries return zero cross-tenant rows; forged order IDs return null; menu isolation; branch IDOR defence.
- **Role gating** (1 test): kitchen can cook, waiter can serve, neither can void.
- **Money recompute** (1 test): cancelled items drop out of the bill.
- **AI summary graceful fallback** (3 tests): summary always returns (never throws); non-existent shift returns null; cross-tenant summary request returns null.

**What I chose not to test, and why** (in `tests/workflow.test.ts` header): NextAuth credentials flow end-to-end (library, tested via password hashing), browser rendering of every screen (Agent Browser covers the golden path), Socket.io delivery under packet loss (best-effort by design, DB is source of truth), and the AI model's prose quality (non-deterministic; we test the fallback path and output sanitisation, which is the engineering contract).

---

## Security — the three risks that matter for what was actually built

1. **Cross-tenant data leakage.** Handled at the application chokepoint (`tenant.ts`), with the IDOR defence (managers can't bypass branch-tenant verification) and the 404-not-403 pattern. Proved by an automated test. **What's not done:** Postgres RLS would make this database-enforced; documented as the first scaling migration.
2. **Prompt injection via the AI summary.** The model receives only structured DB records (numbers, dish names, timestamps) — never waiter notes, never customer data. Output is rendered as text, never executed. Input is size-capped. **What's not done:** if a future feature feeds free text to the model, this needs revisiting.
3. **Credential handling.** Passwords are bcrypt-hashed. `NEXTAUTH_SECRET` is in `.env` for dev (must be rotated for production, sourced from a secret manager). The `REALTIME_BROADCAST_TOKEN` is a shared secret between the Next.js API and the relay over localhost. The AI SDK credentials live in `/etc/.z-ai-config` (server-side, not in the repo). **What's not done:** rate-limiting on the login endpoint (brute-force protection) — should be added before real customer data.

---

## License & status

Prototype for an assessment. Not production-hardened. See `HANDOVER.md` for the full, honest list of known limitations.

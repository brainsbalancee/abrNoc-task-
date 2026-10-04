# DECISIONS.md

Each entry: **decision / reason / alternative considered / trade-off accepted**.

The last two are decisions I now think were wrong, or would revisit.

---

## 1. Build the live order lifecycle, and nothing else, for v1

- **Decision.** Ship one workflow end-to-end: waiter opens a table → adds items → kitchen cooks → waiter serves → cashier takes payment and closes → manager reads a shift summary.
- **Reason.** It is the workflow a restaurant runs every single shift. It is where concurrency bites, where data loss hurts most, and where a working product earns its keep on day one. A half-built menu editor plus a half-built kitchen screen is worth less than one finished, defensible workflow.
- **Alternative considered.** A broader POS with menu management, inventory, reservations, and reporting all at 80%. Rejected — the brief explicitly warns that "we would rather see one workflow finished and defensible than four half-built."
- **Trade-off accepted.** The reviewer cannot click through menu CRUD, inventory, or reservations. That is the point. Those are scoped in `HANDOVER.md` as the next five things.

## 2. Four roles: MANAGER, WAITER, KITCHEN, CASHIER

- **Decision.** The minimum role set that models the workflow. Capability-checked, not role-name-checked, at the API boundary (`src/lib/roles.ts`).
- **Reason.** Each role maps to a distinct actor in the restaurant room. Fewer loses the cashier/kitchen separation that protects money and food. More (e.g. a separate "host" or "runner") is unjustified for v1.
- **Alternative considered.** Three roles (merge cashier into manager — many small Iranian restaurants do this). Rejected because the cashier is often a distinct person at the door in larger operations, and the role boundary protects the payment flow from the cooking flow.
- **Trade-off accepted.** Some tiny restaurants will find four roles more than they need. They can assign one person multiple logins. Acceptable.

## 3. Optimistic concurrency control (OCC) via a `version` field, not pessimistic locking

- **Decision.** `Order` and `OrderItem` carry `version`. Status mutations use `updateMany({ where: { id, version: expected } })`; a stale version yields `count: 0` → HTTP 409. Additive operations (adding items) are append-only and need no version check.
- **Reason.** Restaurant contention is low-frequency and high-value, not high-frequency. A waiter and a kitchen touching the same order a few times a minute is fine with OCC. Pessimistic row locks in SQLite are awkward and would serialize the whole workflow.
- **Alternative considered.** Pessimistic `SELECT ... FOR UPDATE` (not really available in SQLite) or a Redis-based distributed lock. Rejected — over-engineered for the actual load, and SQLite's single-writer model already serialises writes.
- **Trade-off accepted.** Under pathological contention on a *single item's* status, two concurrent transitions produce one 409 that the user must retry. At realistic load this never happens. Documented in `HANDOVER.md`.

## 4. SQLite as the database

- **Decision.** Use the provided SQLite via Prisma. Not a choice I made, but a constraint I designed around.
- **Reason.** The environment provides it; migrating to Postgres within the time box would cost a day for no v1 benefit.
- **Alternative considered.** Postgres from day one for row-level security and true serialisable isolation. Rejected on time-box grounds; noted as the first scaling break-point.
- **Trade-off accepted.** Single-writer serialisation (fine to ~hundreds of concurrent staff), no native row-level security (so tenant isolation is enforced at the app layer — see decision 11), no native enums (status fields are strings validated by a central state-machine module).

## 5. Realtime as a separate Socket.io mini-service, not in-process in Next.js

- **Decision.** A standalone Bun process on port 3003 (Socket.io) + 3004 (internal HTTP) that owns no business state. The Next.js API layer POSTs broadcast events to it after a DB commit. Browser clients connect with their NextAuth JWT; the service verifies it and auto-joins them to branch rooms.
- **Reason.** Next.js route handlers are request-scoped; a persistent socket pool per request is awkward and leaks. A dedicated relay keeps the realtime concern isolated, restartable, and debuggable independently of the web tier.
- **Alternative considered.** Server-Sent Events from a Next.js route, or polling only. Rejected — SSE in Next.js App Router is fiddly with Turbopack and doesn't give us room-join semantics; polling-only is fine for correctness but gives a worse kitchen-display experience (latency, hammering).
- **Trade-off accepted.** One more process to run and monitor. The Caddy gateway requirement (path `/`, `XTransformPort` query) adds deployment friction.

## 6. JWT sessions, not database sessions

- **Decision.** NextAuth v4 with the JWT strategy, 12-hour expiry (a shift). The JWT carries `tenantId`, `role`, `branchIds`, `activeBranchId`.
- **Reason.** Stateless sessions fit serverless/edge and avoid a DB hit per request. 12h covers a shift.
- **Alternative considered.** Database sessions (revocable instantly). Rejected — adds a DB hit per request and a session table to manage; revocation isn't a v1 requirement.
- **Trade-off accepted.** Sessions cannot be revoked mid-shift without rotating `NEXTAUTH_SECRET`. Role or branch changes only take effect on next login. (See decision 12 — this is the one I'd revisit.)

## 7. The AI capability is an end-of-shift summary, with a deterministic fallback

- **Decision.** One AI call per shift close. Input is structured DB records only (counts, totals, dish names, timings). Output is plain prose, rendered as text, never executed. If the LLM fails, times out, or returns garbage, a deterministic template built from the same data fills in. The feature never breaks.
- **Reason.** The brief explicitly names "reporting done by hand at the end of the month." A daily paragraph is what an owner actually reads. A full BI dashboard goes unread by non-technical owners. The fallback is the engineering decision — not the feature.
- **Alternative considered.** AI demand forecasting ("order 30% more lamb tomorrow"). Rejected as irresponsible on day one: it needs weeks of historical data the customer doesn't have, and a wrong forecast wastes real money. A small, defensible capability beats a flashy one.
- **Trade-off accepted.** The summary is narrative, not interactive. You can't drill into it. That's a v2 concern.

## 8. Record payments, do not process them

- **Decision.** `Payment` is a record of method (CASH or POS) + amount + timestamp. We never move money.
- **Reason.** Iran has no access to international card networks. Local card payment happens on the bank's POS terminal at the counter. Faking a Stripe integration would be theatre. Recording the method and amount makes reporting accurate (cash vs POS split, which matters for end-of-shift reconciliation).
- **Alternative considered.** Integrating a local Iranian payment gateway. Rejected — out of time-box scope, requires merchant onboarding and compliance we can't do here, and most restaurants settle the POS terminal separately anyway.
- **Trade-off accepted.** The cashier must record the payment method manually. A future integration could read the POS terminal's daily report.

## 9. English UI with authentic Persian content; defer full i18n/RTL

- **Decision.** UI labels in English. Dish names, restaurant names, and the Toman currency are authentic Persian context. Full Farsi translation and RTL are a documented fast-follow.
- **Reason.** Shipping one language well beats two languages broken. The reviewer can read the UI. The domain authenticity (Chelo Kebab Koobideh, Doogh, Toman) is preserved. `nameFa` is already in the schema for the future switch.
- **Alternative considered.** Ship Farsi-first RTL immediately. Rejected — would consume ~30% of the time box on translation and layout mirroring, with high risk of broken layouts, for a v1 the reviewer must be able to read.
- **Trade-off accepted.** An Iranian waiter who reads only Farsi cannot use v1. This is a real limitation, stated in `HANDOVER.md`, not hidden.

## 10. Toman as integer; no decimals

- **Decision.** All money is integer Toman. `price`, `total`, `discountAmount`, payment `amount` are all `Int`.
- **Reason.** The Toman has no practical subdivision below 1 Toman in restaurant pricing. Integers avoid floating-point drift in sums.
- **Alternative considered.** Decimal/numeric type. Rejected — unnecessary and SQLite's decimal handling is stringly-typed.
- **Trade-off accepted.** A future multi-currency or fractional-Toman requirement would need a migration. Unlikely for this market.

## 11. Tenant isolation enforced at the application layer via a single chokepoint

- **Decision.** Every tenant-scoped query goes through `requireTenant()` / `requireBranch()` / `requireOrderAccess()` in `src/lib/tenant.ts`. These inject `tenantId` into every `where` clause and verify branch ownership even for managers (IDOR defence). There is no unscoped path.
- **Reason.** SQLite has no row-level security. The only safe alternative is to make the scoped path the *only* path, and to make it hard to bypass by convention + review. A test proves the pattern: forged cross-tenant IDs return 404, not 403, to avoid leaking existence.
- **Alternative considered.** Postgres RLS with a `tenant_id` session variable per connection. Rejected on the SQLite constraint (decision 4); documented as the right long-term move.
- **Trade-off accepted.** A developer who writes a raw Prisma query without the helper could leak data. We mitigate by convention (all repos import from `tenant.ts`) and by the cross-tenant test, but it's not enforced by the database. At scale, RLS is mandatory.

## 12. Fire-and-forget realtime emit, not transactional with the DB write

- **Decision.** The API commits to the DB, then POSTs the broadcast event to the realtime service. The emit is best-effort: if it fails, the DB write has already succeeded; we log and move on. Clients poll on a 5–8s interval as a safety net.
- **Reason.** Realtime is an enhancement, not a correctness path. The database is the source of truth. Coupling the emit to the transaction would make the write fail if the realtime service is down — unacceptable.
- **Alternative considered.** Transactional outbox pattern (write the event to an `outbox` table in the same transaction, a worker drains it). Rejected for v1 complexity; the polling fallback covers the gap.
- **Trade-off accepted.** A brief window (up to the poll interval) where a client may see stale data after a concurrent change. For a kitchen display this is sub-second in practice; for a cashier it's irrelevant.

---

## Decisions I now think were wrong, or would revisit

### A. Storing `branchIds` in the JWT (decision 6) — would revisit

During end-to-end testing I re-seeded the database (which deletes and recreates branches), and existing sessions broke because the JWT still held the old `branchIds`. The manager landed on "No branch assigned" until they logged out and back in. In production branches don't get deleted, so this wouldn't bite — but it revealed a real smell: the JWT is a cache of mutable state.

**What I'd do instead.** Store only `tenantId`, `role`, `userId`, and a *session id* in the JWT. Fetch `branchIds` per request from a small in-memory cache (or accept one DB hit per request — branches change rarely, so it's cacheable). This trades one DB lookup per request for correctness under reconfiguration. For a system where staff reassignment is a real operation, that's the right trade.

### B. Order `number` via `count + 1` (in `POST /api/orders`) — genuinely wrong

I generate the per-branch sequential order number as `await db.order.count({ where: { branchId } }) + 1`. This is a race condition: two concurrent order creations can produce the same number. I called it "good enough for SQLite single-writer" in the code comment — and SQLite's serialised writes do make a collision unlikely in practice — but it is *technically wrong* and would break immediately on Postgres with concurrent writers.

**What I'd do instead.** A dedicated `OrderNumber` counter table (or a `branch.orderSeq` column) incremented in a transaction with `UPDATE ... SET seq = seq + 1 RETURNING seq`. That's the correct pattern and costs one extra write. I left the bug in because the blast radius in v1 is a duplicate display number (the order `id` is still a unique cuid, so no data corruption) — but I'd fix it before this went to a second branch.

### C. (Bonus, less severe) The 404-on-forged-id pattern is correct for security but noisy in logs

Returning 404 (not 403) for a cross-tenant access attempt is the right security choice (don't leak existence). But I log these at `error` level, which means a probing attacker fills the 3am log. I'd move auth-404s to a dedicated `security` log level that's sampled and alertable separately from real errors. Minor, but it would make the logs cleaner under attack.

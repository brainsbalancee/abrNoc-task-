# Meshkī — Work Log

---
Task ID: 1-4
Agent: main (Z.ai Code)
Task: SCOPE.md, Prisma schema, auth/tenant layer, seed data, realtime mini-service

Work Log:
- Wrote SCOPE.md (engagement-shape document, before building). Chose the live order lifecycle as the one workflow. Cut menu-builder UI, inventory, B2C ordering, external payments, full i18n.
- Designed domain-driven Prisma schema: Restaurant (tenant) → Branch → Users/Orders/Tables/Shifts. Every tenant-scoped model carries tenantId. Order & OrderItem carry `version` for OCC. State-machine status fields (String, validated app-side because SQLite has no enums).
- Built auth: NextAuth v4 Credentials provider, bcrypt-hashed passwords, JWT sessions. Typed session augmentation (tenantId, role, branchIds). Middleware protects all app routes except /login and /api/auth.
- Built tenant isolation chokepoint (src/lib/tenant.ts): `requireTenant()`, `requireBranch()` (IDOR defence — verifies branch belongs to tenant even for managers), `requireOrderAccess()` (returns 404 not 403 to avoid leaking existence). `requireTenantCapability()` for role checks.
- Built order state machine (src/lib/order-state.ts): PENDING→PREPARING→READY→SERVED, PENDING→CANCELLED. Role-gated transitions (kitchen cooks, waiter serves, cashier/manager close).
- Built roles.ts: 4 roles (MANAGER/WAITER/KITCHEN/CASHIER) with capability matrix.
- Built Socket.io mini-service on port 3003 (mini-services/realtime/index.ts): verifies NextAuth JWT via jose, server-controlled branch room membership (client cannot join arbitrary rooms), internal /internal/broadcast HTTP endpoint for server emits. Started and running.
- Built realistic seed: Shandiz Garden (2 branches, 29-item Persian menu, 6 staff) + Saffron House (1 branch, 2-item menu — second tenant for isolation tests). Closed shift yesterday with 8 historical orders + pre-written AI summary. Open shift today with 3 live orders at mixed statuses (PENDING/PREPARING/READY/SERVED) so kitchen & waiter screens have live data immediately.

Stage Summary:
- Database seeded and running. Realtime mini-service running on :3003.
- Demo credentials: all passwords `demo1234`. Manager/waiter/kitchen/cashier @shandiz.test, plus manager/waiter @saffron.test.
- Next: API layer for order workflow (concurrency-safe mutations), then frontend, then AI summary, tests, docs.

---
Task ID: 5-11
Agent: main (Z.ai Code)
Task: API layer, frontend, AI summary, tests, docs, end-to-end verification

Work Log:
- Built order workflow API: create order (lazy shift open, sequential number), add items (append-only, tenant-verified menu items), advance item status (OCC updateMany with version → 409 on stale), apply discount/service (OCC on order), record payment (balance check), close/void (state machine). All recompute totals server-side.
- Built shift API: current shift with live aggregates, close shift (requires 0 open orders, computes aggregates, calls AI summary), last-closed, regenerate summary.
- Built AI shift summary (src/lib/ai-summary.ts): structured-data-only prompt, 20s timeout, deterministic fallback template if AI fails. Output sanitised, never executed. Tested via real ZAI SDK call in seed → produced accurate prose matching the seeded numbers.
- Built frontend: login (one-click demo accounts), app shell (role-gated nav, branch switcher, realtime indicator), dashboard (role-aware), waiter table grid, kitchen display (3-column live board), cashier (open checks + checkout dialog), shared order detail (add items, advance status, menu panel), reports (live shift + AI summary with regenerate).
- Built realtime hook (use-realtime.ts): reads NextAuth cookie, passes as socket.io auth, server-controlled room join.
- Fixed two runtime bugs caught by Agent Browser: (1) `../layout` import path on nested order page → `../../layout`; (2) variable shadowing TDZ in Prisma transaction (inner `const order` shadowed outer) → renamed to `ord`.
- Fixed middleware over-broad (was catching /api/health) → excluded all /api (API enforces auth itself via requireTenant).
- Fixed realtime HTTP/swallow by engine.io → split into two ports (3003 socket.io, 3004 internal HTTP).
- Fixed seed: replaced hardcoded (wrong) AI summary text with a real generateShiftSummary() call so the displayed summary matches the actual computed data.
- Wrote 22 integration tests (full order workflow + cross-tenant isolation proof + role gating + money recompute + AI fallback). All pass.
- Wrote SCOPE.md, DECISIONS.md (incl. 2 decisions I'd revisit: JWT-cached branchIds, count+1 order numbers), AI_USAGE.md, HANDOVER.md (for non-technical owner, with scaling analysis at 10/1k/100k), README.md.

Verification (Agent Browser, end-to-end):
- Login as waiter1 → dashboard shows 3 open checks, nav gated to Dashboard+Waiter.
- Waiter table grid: 12 tables, 3 with open checks (T1/T3/T7) showing totals.
- Order detail #1044: 3 items at PREPARING/READY/SERVED, totals correct (935,000 T), menu panel populated. Added Chelo Kebab Barg → POST 201, count 3→4, toast "Added 1 item line(s)".
- Kitchen display: New tickets / Cooking / Ready columns all populated with Start-cooking / Mark-ready buttons.
- Cross-tenant API: saffron manager GET shandiz order → 404 "Order not found" (no existence leak). Saffron menu shows only its 2 items.
- Reports: open shift (3 open / 0 closed), close button disabled (open checks exist). Last closed shift: "8 checks · 7,293,250 T gross", AI summary via GLM-4-PLUS accurate to data.
- Cashier: Take payment dialog → Record 935,000 T & close → POST payment 201, PATCH order 200, toast "Check closed", open-checks list 3→2.
- Login as cashier → nav gated to Dashboard+Cashier only.

Stage Summary:
- Live URL via Preview Panel. Demo credentials: all passwords `demo1234`.
- 22 tests pass, lint clean, both services (Next.js :3000, realtime :3003+:3004) running.
- All assessment parts delivered: SCOPE.md, product (order lifecycle + AI summary + real-time + isolation), DECISIONS.md, AI_USAGE.md, HANDOVER.md, README.md, tests.

---
Task ID: AUDIT
Agent: main (Z.ai Code) — skeptical senior engineer review
Task: Full audit against the master verification checklist, fix defects, retest

Work Log:
- BASELINE: lint clean, but tsc had 2 real errors in my code (api-utils.ts params Promise cast, items/route.ts never[] inference). 22 tests pass.
- P0 FOUND: `.env` (with NEXTAUTH_SECRET) and `db/custom.db` (with bcrypt password hashes) were tracked in git — committed before .gitignore was added. FIXED: git rm --cached, created .env.example with placeholders, added db/*.db to .gitignore.
- P0 FOUND: `bun test` destroyed demo data — the test's beforeAll ran deleteMany() on the demo DB. A reviewer running tests would break every demo login. FIXED: tests now use db/test.db via a bunfig.toml preload (tests/setup.ts) that sets DATABASE_URL before any module loads. Demo DB never touched by tests.
- P1 FIXED: TypeScript errors in api-utils.ts (params Promise type) and items/route.ts (newItems never[]). Added bun-types to tsconfig. tsc --noEmit now clean.
- P1 ADDED: 20 new API-boundary tests (tests/api-isolation.test.ts) using real NextAuth sessions against the running dev server: 12 cross-tenant isolation tests (forged order IDs, nested resource access, cross-tenant menu injection, mass assignment, unauthenticated, shift summary forgery), 3 real concurrency tests (Promise.all of simultaneous PATCHes — one wins 200, one gets 409), 5 validation tests (illegal transitions, balance check, no-payment close, duplicate open check, role enforcement).
- P1 ADDED: Security headers via next.config.ts (X-Frame-Options DENY, CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- P1 ADDED: Rate limiting on login (10/min per IP, 200/min localhost for dev/tests) and AI summary endpoint (5/min per user). In-memory, documented as process-local (multi-instance needs Redis).
- VERIFIED: 42 tests pass (22 workflow + 20 API isolation/concurrency). Lint clean. Typecheck clean. Demo data intact (8 users) after full test run. All 5 demo roles login successfully. Security headers present. Rate limiter triggers (5 events logged after 12 brute-force attempts).

Stage Summary:
- All P0/P1 defects found and fixed. No critical security or data-integrity issues remain.
- Test count: 22 → 42 (20 new API/concurrency tests).
- Remaining documented risks: in-memory rate limiter (process-local, not multi-instance safe — documented), no Postgres RLS (app-layer isolation only — documented as first scaling migration), order number race condition (documented in DECISIONS.md).

# HANDOVER.md

Written for a **restaurant owner who is not technical**. Plain language throughout.

---

## What was delivered, in plain language

A working piece of software for running the front-of-house of your restaurant during a shift. It runs on the internet, you log in, and your staff use it on phones, tablets, or a laptop at the counter.

It does **one thing well**: it takes an order from the moment a waiter opens a table, through the kitchen cooking it, to the cashier taking the money and closing the check — with everyone seeing the same thing at the same time, and nothing getting lost when two people touch the same order.

It also writes you a **short plain-English summary at the end of each shift**: how many checks, how much money, what sold best, and one thing worth noticing. You don't have to add up the day by hand.

It does **not** (yet): take orders from customers online, manage your stockroom, handle reservations, or process card payments through a bank (more on that below).

It is set up with a realistic demo restaurant — **Shandiz Garden**, two branches (Valiasr and Saadat Abad), a full Persian menu, and a second restaurant (Saffron House) so we can prove your data never leaks to anyone else.

---

## Demo credentials (all passwords: `demo1234`)

| Role | Login | What they can do |
|---|---|---|
| Manager | `manager@shandiz.test` | Everything: see reports, close the shift, read the AI summary. |
| Waiter | `waiter1@shandiz.test` | Take orders at tables (Valiasr branch). |
| Kitchen | `kitchen@shandiz.test` | See incoming tickets, mark items cooking / ready. |
| Cashier | `cashier@shandiz.test` | Take payment, apply discounts, close checks. |
| Second restaurant | `manager@saffron.test` | A separate restaurant — proves your data is isolated. |

Open the **login page** and click any demo account to sign in with one click.

---

## The main workflow — so your staff can start using it Monday

### 1. The manager opens the shift (or it opens itself)

When the first order of the day is created, the shift opens automatically. The manager doesn't need to do anything to start. The manager can see the shift is live on the **Reports** page.

### 2. The waiter takes the order

1. Waiter signs in, taps **Waiter**.
2. Sees a grid of tables. Tables with an open check show the check number and total.
3. Taps a table → either continues an open check or opens a new one.
4. On the order page, scrolls the menu, taps **+** to add quantities, taps **Add to check**.
5. Items appear on the kitchen screen within about a second.

A waiter can add notes to items ("no onion", "extra spicy"). Two waiters can add to the same check at the same time without overwriting each other — the system is built so adding is always safe.

### 3. The kitchen cooks

1. Chef signs in, taps **Kitchen**.
2. Sees three columns: **New tickets** → **Cooking** → **Ready to serve**.
3. Taps **Start cooking** on a new ticket → it moves to Cooking.
4. Taps **Mark ready** → it moves to Ready.
5. The waiter's screen updates so they know the dish is ready to carry to the table.

The kitchen cannot see prices or payments. They see the food, not the money.

### 4. The waiter serves

Back on the order page (or by tapping the order), the waiter sees items marked **Ready** and taps **Mark served**. The item is now done.

### 5. The cashier closes the check

1. Cashier signs in, taps **Cashier**.
2. Sees all open checks with their totals.
3. Taps **Take payment**.
4. Optionally applies a **discount** (flat Toman) and a **service charge** (percent).
5. Picks **Cash** or **POS card** (POS = the local bank card terminal — we record it, we don't process it).
6. Taps **Record & close**. The check is closed.

### 6. The manager closes the shift and reads the summary

1. Manager signs in, taps **Reports**.
2. Sees the live shift (open checks, gross so far).
3. Makes sure all checks are closed (the button is disabled until they are).
4. Taps **Close shift & generate AI summary**. This takes about 10–15 seconds.
5. Reads the summary: a short paragraph in plain English about how the shift went, top sellers, and one suggestion. If the AI is unavailable that evening, you still get a summary — it's just written from a template instead of by the AI. You are never left without a shift report.

That's the whole day, every day.

---

## Known limitations, stated plainly

This is a first version. It works for a real shift, but it has limits. I'd rather you know all of them now than discover them mid-service.

### Functional limits

- **No menu editing in the app.** The menu is set up in the demo data. Editing it (adding dishes, changing prices) requires a technical step today. This is the #1 thing to build next.
- **No stockroom / inventory.** The system doesn't know how many kebabs you can still sell tonight. It assumes the menu is available.
- **No customer-facing online ordering.** This is for your staff, not your customers.
- **No reservations.**
- **No loyalty programme or customer accounts.**
- **Does not process card payments.** Iran has no access to international card networks. Your local POS terminal does the card payment; this system *records* that it happened so your books balance. Cash and POS are the only two methods modelled.
- **English interface only, with Persian dish names.** The buttons and labels are in English. A waiter who reads only Farsi cannot use it yet. This is a real gap; full Persian translation and right-to-left layout is the next priority after menu editing.
- **One branch at a time per screen.** A waiter assigned to two branches must switch via the dropdown. They cannot see both branches' tables simultaneously.
- **Order numbers are per-branch and may rarely duplicate under very high concurrency.** In practice this won't happen at one branch's load. It's a known bug I'd fix before scaling.

### Operational limits

- **If the internet drops on a tablet mid-shift**, that tablet can't see new orders until it reconnects. No data is lost — the database is the source of truth — but the kitchen screen will go dark until the connection comes back. There's no offline mode.
- **The AI summary takes 10–15 seconds to generate** when you close a shift. This is normal and acceptable; you close a shift once a day.
- **If the AI service is down**, you still get a summary (from the deterministic fallback template), but it's less eloquent. You are never left without a shift report.
- **Sessions last 12 hours.** If a waiter leaves a tablet logged in overnight, they'll need to sign in again in the morning. This is by design (a shift is roughly 12 hours).
- **You cannot revoke a staff member's access instantly** if they're already logged in — their session lasts until it expires or they sign out. Removing their account stops new logins; it doesn't kill the existing session. (This is the trade-off of stateless sessions; documented in `DECISIONS.md`.)

### Security limits worth knowing

- **Your data is isolated from other restaurants** — proved by an automated test. Restaurant A cannot read or modify Restaurant B's orders, menu, or tables. A forged order ID returns "not found" rather than "forbidden," so an attacker can't even confirm an order exists.
- **Passwords are hashed** (bcrypt), never stored in plain text, never returned by any API.
- **The AI summary sees only numbers and dish names** — never customer data, never free-text notes from waiters. There's no way for a waiter's note to reach the AI model.
- **What's not yet done**: there is no audit log *viewer* in the UI (the audit trail is written to the database, but only a developer can read it today), and there is no rate-limiting on the login endpoint (a brute-force protection layer should be added before real customer data).

---

## The next five things I'd build, ranked

1. **Menu management UI.** Today the menu is seeded. A manager needs to add dishes, change prices, mark items 86'd (sold out), and reorder categories — without a developer. This is the single highest-value gap. Without it, every price change is a support ticket.
2. **Full Persian (Farsi) language + right-to-left layout.** The market is Iran; the staff are Persian speakers. The schema already stores `nameFa` for every dish. Shipping the translation + RTL is mostly layout work, but it's the difference between "a demo I can read" and "a product my staff can use."
3. **Inventory / 86'd items.** When the kitchen runs out of an ingredient, they should mark dishes unavailable so waiters can't order them. This prevents the worst customer experience (ordering something the kitchen can't make). Ties into the menu management UI.
4. **End-of-night reconciliation report.** The AI summary is narrative; the cashier also needs a strict, printable reconciliation: cash expected vs cash in drawer, POS totals vs terminal report, voided items with reasons. This is the document the owner takes to the accountant.
5. **Branch-level dashboard for multi-branch owners.** A manager who owns two branches should see both side by side: which branch is busier right now, which is making more per check. The data model already supports multi-branch; the UI is single-branch today.

Reasoning for the order: 1 and 2 are *blockers* for real use (you can't run a restaurant where a price change needs a developer, and you can't run it in Iran in English). 3 prevents the worst customer-facing failure. 4 is the document the owner actually hands to an accountant. 5 is the first step toward the multi-branch SaaS vision.

---

## Where this architecture breaks: at 10, at 1,000, at 100,000 restaurants

### At 10 restaurants — it doesn't break.

SQLite handles this trivially. The realtime relay handles a few dozen concurrent sockets per branch. You'd run the whole thing on one small server. The only friction is operational: you'd want a backup script for the SQLite file and a way to restart the realtime service if it crashes. Nothing architectural changes.

### At 1,000 restaurants — SQLite's single-writer model starts to hurt.

Here's where it specifically breaks:

- **Write contention on the SQLite file.** SQLite serialises writes. At ~1,000 restaurants each doing dozens of orders/day, the write queue becomes the bottleneck. Kitchen displays would feel sluggish during peak. **Fix:** migrate to Postgres. The Prisma schema is already database-agnostic; the migration is mostly connection-string + a few SQLite-specific tweaks.
- **The realtime relay is a single process.** A few thousand concurrent WebSocket connections on one Bun process is feasible but fragile. **Fix:** run the relay behind a sticky-session load balancer, or move to a managed pub/sub (Redis) that the relay subscribes to. The "branch room" abstraction doesn't change.
- **The JWT carries `branchIds`, which get stale on reconfiguration.** At 1,000 restaurants, staff reassignment happens daily. **Fix:** the decision I'd revisit in `DECISIONS.md` — store only `tenantId`/`role` in the JWT and fetch `branchIds` per request with caching.
- **Tenant isolation is enforced at the app layer, not the database.** At 1,000 restaurants, a single developer mistake in a new query could leak data across tenants. **Fix:** Postgres Row-Level Security with a `tenant_id` session variable per connection. This is the right long-term move and is the main reason to leave SQLite.

What *doesn't* break at 1,000: the concurrency model (OCC scales fine), the AI summary (one call per shift per branch is negligible), the role model, the workflow design.

### At 100,000 restaurants — the single-tenant assumptions break, not just the database.

- **The realtime fan-out.** 100k restaurants × even 5 concurrent screens each = 500k WebSocket connections. A single relay (or even a few) cannot hold this. **Fix:** a sharded pub/sub layer (Redis Cluster or a managed equivalent), with the relay as a stateless edge function per region. This is a real architecture change, not a config tweak.
- **The "one database" assumption.** 100k tenants in one Postgres database is possible but operationally unwise. **Fix:** database-per-tenant or schema-per-tenant for the largest, with a routing layer. This is a significant change to the data access layer (every query gains a tenant-routing dimension).
- **The AI summary cost and rate limits.** 100k restaurants closing shifts around the same evening = a burst of 100k LLM calls in a few hours. **Fix:** a queue with backpressure, a model cache (identical shifts return cached summaries), and a lower-cost model for the routine case. The fallback template handles overload gracefully.
- **Multi-region.** At 100k restaurants you have customers in multiple regions with latency expectations. **Fix:** deploy per region with data residency, and accept that a global manager view is eventually consistent across regions.

**The honest summary:** the architecture is deliberately sized for the first 1,000 restaurants, with two specific planned migrations (SQLite→Postgres, app-layer→RLS isolation) that buy you the next order of magnitude. Beyond 10,000, the realtime fan-out and the single-database assumptions need real rework. I would not pretend otherwise to a customer.

---

## One thing to remember above all

This is a first version that **works during a real shift**. It is not a finished product. The known limitations above are real, and I have not hidden any of them. If you find one I didn't list, that's a bug, and I'd rather hear about it than have you discover it at 8pm on a Friday.

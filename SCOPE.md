# SCOPE.md — Meshkī Restaurant Platform

> Engagement-shape document. Written **before** building, to agree the shape of the work with a first customer. This is not a description of what shipped — it is what we'd put on the table at kickoff.

---

## 1. The problem, as we understand it

Independent cafés and restaurants in Iran run on a patchwork:

- A printed menu (changed by hand, sometimes out of date the day it's printed).
- A basic POS that prints a bill.
- **Paper notes** carried from table to kitchen — the waiter's order ticket.
- A messaging app (usually WhatsApp/Telegram) for "the kebab for table 7 is ready".
- A separate cash/card flow at the door.
- End-of-month reporting done **by hand**, on paper or in a spreadsheet the owner dreads opening.

The result is lost tickets, wrong food, voids nobody accounts for, and an owner who has no idea which dish actually makes money until the accountant calls three weeks later.

---

## 2. What Iran specifically changes

We are not building a generic Western restaurant tool. The differences that shape this product:

1. **No international payment rails.** Stripe, PayPal, Adyen do not operate for Iranian merchants. Card payment happens on the local bank's POS terminal at the counter. **We do not attempt to process card payments.** We record the payment method and amount against the order so reporting is accurate. This is the honest call; faking a Stripe integration would be theatre.
2. **Currency is the Toman**, not USD/EUR, and prices are whole-number Toman (no practical subdivision below 1 Toman in restaurant pricing). We store integers.
3. **VAT is officially 9%** on restaurant services but is, in practice, often bundled into the menu price by tradition. We model `taxRate` per branch, default `0`, and let the manager decide. We do not pretend the ambiguity doesn't exist.
4. **Service charge** (5–10%, optional) is common and often added by hand on the bill. Modeled as an optional per-order field.
5. **Language is Persian (Farsi), RTL.** First version ships English UI with authentic Persian content (dish names, restaurant names, Toman). Full i18n is a fast-follow, not faked. We'd rather ship one language well than two languages broken.
6. **The room.** A branch is a room full of people — waiter, kitchen, cashier, manager — all touching the same orders at once. A lost ticket isn't an inconvenience; it's a wrong meal and an angry customer.

---

## 3. What we will build in this engagement (in-scope)

One workflow, finished and defensible: **the live order lifecycle.**

```
Waiter opens table → adds items (with notes: "no onion")
        ↓ (real-time)
Kitchen display updates → marks items PREPARING → READY
        ↓ (real-time)
Waiter sees READY → marks SERVED
        ↓
Cashier applies discount/service → records payment (cash or POS) → closes check
        ↓
Manager closes shift → gets an AI-generated plain-language shift summary
```

This is the workflow a restaurant runs **every single shift**. It is where concurrency bites, where data loss hurts most, and where a working product earns its keep on day one.

### Roles (the minimum that model the workflow)

| Role | Can | Cannot |
|---|---|---|
| **MANAGER** | Everything in their restaurant: menu, reports, staff, voids, discounts, close shift | See any other restaurant's data |
| **WAITER** | Create/edit orders for assigned tables, mark items served | See prices, payments, or other branches |
| **KITCHEN** | See incoming items, mark PREPARING / READY | See prices, payments, or other branches |
| **CASHIER** | View orders, apply discount/service, record payments, close checks | Edit menu, manage staff |

Four roles, not seven. We considered merging cashier into manager (many small Iranian restaurants do) but kept it separate because the cashier is often a distinct person at the door in larger operations — and the role boundary protects the money flow.

### Multi-tenancy guarantee

- A **Restaurant** is the tenant boundary. Every tenant-scoped table carries `tenantId`.
- A user belongs to exactly one Restaurant, and to one or more Branches within it.
- **All data access goes through a `scoped()` helper** that injects `tenantId` into every `where` clause. There is no unscoped path.
- We will **prove** isolation with an automated test: Restaurant A logs in, attempts to read/modify Restaurant B's orders, menu, and tables by forging IDs — every attempt must fail closed.

### Concurrency guarantee

- **Optimistic concurrency control** via a `version` field on `Order` and `OrderItem`.
- **State machine** on item status: `PENDING → PREPARING → READY → SERVED`, plus `PENDING → CANCELLED`. The server rejects illegal transitions with `409 Conflict`.
- **Additive operations are safe by construction**: two waiters adding items to the same order concurrently both succeed (append-only). Version checks apply only to status mutations and order-level mutations (discount, table assignment, close).
- **Real-time**: a Socket.io service broadcasts order changes to all screens subscribed to a branch, after the DB commit. Kitchen and waiter screens see updates within ~1s on a healthy connection.
- **Where it breaks** (stated honestly in HANDOVER.md): under extreme contention on a *single item's* status, last-write-wins on the transition but the path is always valid. No pessimistic locking. At realistic restaurant load (dozens of active orders per branch) this is fine.

### The AI capability — one, defensible

**End-of-shift AI summary** for the manager.

When the manager closes a shift, the system compiles structured shift data (orders, items sold, revenue, timing, voids) and asks the LLM for a short plain-language paragraph: what happened, top items, one anomaly, one suggestion.

**Why this, and not something flashier:**

- The brief explicitly names "reporting done by hand at the end of the month" as a pain point. We are addressing a stated problem, not inventing one.
- A full BI dashboard is overkill for a two-table kebab shop and goes unread by non-technical owners. A daily paragraph is what owners actually read.
- **Graceful degradation is the engineering decision, not the feature.** If the AI provider fails or latency spikes, we fall back to a **deterministic template summary** built from the same structured data. The feature never breaks; it just becomes less eloquent. The owner still gets their shift report at 11pm even if the AI gateway is down.
- **Cost**: one LLM call per shift per branch per day. Negligible.
- **Latency**: not real-time; 5–10s acceptable, with a loading state.
- **Prompt injection**: input is structured DB records (numbers, item names, timestamps), never free user text. Output is rendered as text only, never executed. We cap input size and constrain output format.

**The ambitious version we rejected** (and will say so in DECISIONS.md): AI demand forecasting ("order 30% more lamb tomorrow"). Sounds impressive, but needs weeks of historical data the customer doesn't have, and a wrong forecast wastes real money. Irresponsible to ship on day one.

---

## 4. What is explicitly OUT of scope for this engagement

These are deliberate cuts, not oversights:

| Cut | Why |
|---|---|
| Menu builder UI | Seed provides a full menu; full CRUD UI is a fast-follow, not day-one value |
| Inventory / stock tracking | Valuable but separate workflow; ships in phase 2 |
| Customer-facing online ordering | Different product (B2C), different trust model |
| Reservations / waitlist | Important but independent of the order lifecycle |
| CRM / loyalty | Needs customer identity infrastructure we won't build yet |
| External payment processing | Impossible in Iran (no rails); we record, not process |
| Multi-currency | Toman only |
| Full Persian i18n / RTL | Fast-follow; English UI ships with authentic Persian content |
| Branch-to-branch transfers | Operational edge case; defer |
| Mobile native apps | Responsive web first; PWA-capable, no native builds |
| Advanced analytics beyond the AI summary | The summary is the 80/20 |

This list is as important as the in-scope list. The skill being hired for is deciding what **not** to build.

---

## 5. Deliverables we will accept

- A running deployment over HTTPS with a live URL.
- Demo credentials for all four roles, against a **realistic Iranian restaurant** (Shandiz Garden — two branches, authentic Persian menu, plausible staff and order history).
- The order lifecycle usable during an actual shift: a waiter, a kitchen screen, and a cashier can operate concurrently without losing data.
- Proof of tenant isolation (automated test).
- `README.md` — local setup, one command, architecture overview.
- `SCOPE.md` (this), `DECISIONS.md`, `AI_USAGE.md`, `HANDOVER.md`.
- At least one test covering a full user workflow, plus a statement of what we chose not to test and why.

---

## 6. What "done" looks like for this phase

A restaurant could open the app on a Monday morning, take real orders through a real shift, close the till, and read a shift summary that evening — without anything silently lost, and without ever seeing another restaurant's data.

Everything beyond that is phase 2, scoped in HANDOVER.md.

---

## 7. Time box

6 hours of build time, delivered within 4 calendar days. The cap is part of the exercise. Where the build exceeds the box, we say so and say where the time went.

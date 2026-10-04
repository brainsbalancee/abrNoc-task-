# AI_USAGE.md

Which tools, what for, where they saved real time, where they produced something bad, one recommendation I rejected and why, how I verified generated code, and which parts of the architecture were my own thinking.

---

## Which AI tools I used, and for what

| Tool | Used for | Honest assessment |
|---|---|---|
| **Z.ai Code (this agent)** | Scaffolding, schema design, API routes, frontend, docs | The bulk of the implementation. Saved real time on boilerplate (Prisma queries, shadcn wiring, NextAuth config). Required correction in a few places — see below. |
| **glm-4-plus (via z-ai-web-dev-sdk)** | The one in-product AI feature: the end-of-shift summary | This is the AI capability the product ships. It runs server-side, on structured data, with a deterministic fallback. Verified to produce accurate, data-grounded prose. |
| **Agent Browser** | End-to-end verification of the running app | Caught two real bugs the compiler couldn't: a relative-import path error (`../layout` vs `../../layout`) and a variable-shadowing TDZ bug in a Prisma transaction. Worth its weight. |

I did not use any other AI tools (no Copilot, no external LLMs beyond the two above).

---

## Where AI saved real time

1. **NextAuth credentials provider + JWT session augmentation.** The typing dance for `next-auth` module augmentation (`declare module 'next-auth'`) is fiddly. AI produced a correct, typed config in one pass. Saved ~30 min.
2. **Prisma schema with relations.** The first pass had two back-relation errors (a `MenuItem.restaurant` relation without a back-field, and an `AuditLog.user` relation where the scalar was optional but the relation wasn't). AI surfaced both in the `prisma db push` errors and I fixed them iteratively. The fixes were small but the diagnosis was fast.
3. **shadcn/ui composition.** The kitchen display, cashier checkout dialog, and order detail page all compose shadcn primitives (Card, Dialog, Badge, ScrollArea, Input). AI laid these out correctly against the installed component set on the first try — no time lost to "which prop does this component take."
4. **The AI summary prompt.** Iterating the system prompt ("no markdown, max 120 words, don't invent numbers") against real shift data took two tries. The second pass produced prose that matched the seeded numbers exactly. Saved the back-and-forth of hand-tuning.

---

## Where AI produced something bad (and I caught it)

1. **Variable shadowing → temporal dead zone in a Prisma transaction.** The generated `POST /api/orders/[id]/items` route named the inner `const order = await tx.order.findUnique(...)`, shadowing the outer `order` from `requireOrderAccess`. The line `tx.orderItem.findMany({ where: { orderId: order.id } })` then hit `ReferenceError: Cannot access 'order' before initialization`. The compiler was happy; it only failed at runtime. Agent Browser caught it on the first real click. Fix: renamed the inner variable to `ord`. This is the kind of bug a careful human reviewer would also miss on a quick read.
2. **A relative import path.** The order detail page (`src/app/(app)/orders/[id]/page.tsx`) imported `from '../layout'`, but it's nested two levels deep, so the correct path is `'../../layout'`. AI got the shallower pages right and the deeper one wrong. Agent Browser surfaced it as a "Module not found" error overlay. Trivial fix, but invisible to the compiler until the route was hit.
3. **AI summary vs. real data mismatch (my own seed, not the model).** My first seed hardcoded an AI summary string that said "9,385,000 Toman gross" while the actual computed `grossTotal` was 7,293,250. The model wasn't wrong — my hand-written text was. Fix: the seed now calls the real `generateShiftSummary()` so the displayed summary is always generated from the actual data. This is the most important correction in the build: it kept the demo honest.

---

## One recommendation I rejected, and why

**Recommendation rejected: "Add AI demand forecasting for inventory."**

The suggestion (from the general pattern of "restaurant SaaS + AI") was to predict tomorrow's ingredient demand from order history and suggest prep quantities. I rejected it for v1 and would reject it again:

- It needs weeks of historical data the customer doesn't have on day one.
- A wrong forecast wastes real money (spoilage) or loses real sales (stockouts).
- The confidence interval on day-1 data is so wide the suggestion is noise.
- The honest, defensible AI capability is the shift summary, which runs on a single shift's data and degrades gracefully. That's the right size of AI for the problem.

This is documented in `DECISIONS.md` (decision 7) and `SCOPE.md`. The case for *not* using ambitious AI is part of what I'm defending.

---

## How I verified generated code

I did not ship any AI-generated code without verification. The verification layers, in order:

1. **`bun run lint`** after every meaningful change. ESLint caught the React ref-during-render violation in `use-realtime.ts` before it ever ran.
2. **`bun run db:push`** to validate the Prisma schema against the database. Relation and back-field errors surfaced here.
3. **`bun test`** — 22 integration tests, including a full order workflow and a cross-tenant isolation proof. The test that failed (missing Saffron user) revealed incomplete test setup, which I fixed.
4. **HTTP-level smoke tests** with `curl` + a cookie jar: full NextAuth credentials flow, session payload inspection, cross-tenant forged-orderId attempt (confirmed 404, not 403).
5. **Agent Browser** for the golden path: login as each role, dashboard nav gating, waiter table grid, order detail (add item, advance status), kitchen display, cashier take-payment-and-close, reports with the AI summary. This is where the two runtime bugs (TDZ, import path) were caught.
6. **Reading the AI's own output.** The shift summary is rendered as text and never executed; I read it against the seeded numbers to confirm it didn't invent figures. (It did not.)

---

## Which parts of the architecture were my own thinking

- **The product scope.** Choosing the order lifecycle, and what to cut, is my judgment. No tool told me to defer inventory or reservations; I read that from the brief.
- **The concurrency model.** OCC with `version` fields, append-only item adds, and the state machine for item status are my design. AI wrote the code; the *pattern* is mine.
- **The tenant-isolation chokepoint.** The `requireTenant` / `requireBranch` / `requireOrderAccess` trio, and the decision to return 404 (not 403) for forged cross-tenant IDs, are my calls. AI implemented them; the security reasoning is mine.
- **The AI capability's shape.** The decision to ship a summary *with a deterministic fallback*, and to feed the model only structured data, is the engineering decision I'm most willing to defend. The fallback is the point.
- **The realtime relay architecture.** The two-port split (3003 socket.io / 3004 internal HTTP) was my fix for the engine.io path collision, not AI's first suggestion.
- **The Iran-specific calls.** Toman-as-integer, record-don't-process payments, tax-inclusive defaults, English-with-Persian-content. These are product judgments grounded in the market, not tool output.

---

## Net assessment

AI was a real multiplier on the *mechanics* of this build — boilerplate, wiring, first-draft components. It was a net *cost* on correctness in two specific places (TDZ bug, import path), both of which a human reviewer or a browser test catches. The parts that matter most — the scope, the concurrency model, the tenant boundary, the AI capability's shape — are human decisions that AI implemented, not originated.

The single most important verification step was **Agent Browser on the running app**. Lint and tests gave false confidence; the browser found the real bugs.

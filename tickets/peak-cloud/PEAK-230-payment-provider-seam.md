# [PEAK-230] Payment provider seam

|  |  |
|---|---|
| **Wave** | **1** |
| **Status** | OPEN |
| **Area** | Commerce |
| **Depends on** | PEAK-200 |
| **Blocks** | **PEAK-212, PEAK-231, PEAK-232, PEAK-262** |
| **Blocked by decision** | — |
| **Files you own** | `lib/commerce/provider.ts`, `lib/commerce/index.ts` |
| **Risk** | architecture / money |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Four surfaces move money and they do not move it the same way. Trade often
moves none at all, or money as one leg of a barter. A thin internal interface
keeps that from distorting the product.

## Scope
`lib/commerce/provider.ts` — the `PaymentProvider` interface exactly as
specified in `docs/PEAK-COMMERCE.md` §2: seller onboarding, one-off payments,
capture, refund, subscriptions, webhook verification.

Plus: `lib/commerce/index.ts` resolving the configured provider, and the
order state machine (`pending → authorized → paid → fulfilled`, with
`cancelled`, `refunded`, `disputed`).

## Rules
1. **The database is the record of intent; the provider is the record of fact.**
   Never infer payment status from Peak's tables — reconcile from webhooks.
2. **Idempotency everywhere.** `createPayment` keys on `order.id`. A retried
   network call must never produce a second charge.
3. **Webhook signatures verified.** Unverified events are discarded and logged.
4. **No secret reaches the client.**

## Acceptance criteria
- Given the interface, when a second provider is added, then no surface code
  changes.
- Given a duplicated `createPayment` for one order, then one charge exists.
- Given an unsigned webhook, then it is rejected and logged, never processed.

## Verification evidence
A fake in-memory provider implementing the interface, plus state machine tests
including the double-submit case. Paste the run.

## Rollback
No behaviour ships in this ticket; it is the seam only.

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint         # once PEAK-207 lands
pnpm typecheck
pnpm build
pnpm test         # once PEAK-206 lands
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

Plus this ticket's own **Verification evidence** above.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If it links to a route that
does not exist yet, add the line with your ticket number. That list may only
shrink.

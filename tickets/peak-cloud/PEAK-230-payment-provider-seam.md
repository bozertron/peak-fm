# [PEAK-230] Payment provider seam

- Priority: P0 · Area: Commerce · Status: OPEN
- Dependencies: PEAK-200 · Blocks: PEAK-212, PEAK-231, PEAK-232, PEAK-262
- Risk: architecture / money

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

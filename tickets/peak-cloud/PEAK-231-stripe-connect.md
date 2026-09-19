# [PEAK-231] Stripe Connect implementation

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN — **blocked by D4** |
| **Area** | Commerce |
| **Depends on** | PEAK-230 |
| **Blocks** | PEAK-232, PEAK-262 |
| **Blocked by decision** | **D4** |
| **Files you own** | `lib/commerce/stripe.ts`, `app/api/webhooks/**` |
| **Risk** | money / compliance |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Implement `PaymentProvider` against Stripe Connect, per the mapping in
`docs/PEAK-COMMERCE.md` §3.

## Scope
Express connected accounts with hosted onboarding; PaymentIntents with
`application_fee_amount`; **separate charges and transfers** so a refund does
not have to claw back a completed payout; Stripe Billing for rental auto-pay;
webhook endpoint with signature verification writing back to `order` and
`autopay_contract`.

## Blocked
**D4** — does Peak hold funds or purely facilitate? This is a regulatory
posture in Canada, not a coding choice. Halt and ask.

## Acceptance criteria
- Given a seller, when they complete onboarding, then `chargesEnabled` and
  `payoutsEnabled` are reflected and they can publish a priced listing.
- Given a buyer paying, then the order reaches `paid` **only** from the webhook.
- Given a refund, then the record reconciles without a negative payout balance.

## Verification evidence
Stripe test mode, end to end, with the webhook log pasted. Test keys only —
no live key in any environment file.

## Rollback
Behind `commerce.checkout`.

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

# [PEAK-262] Rent: Auto-Pay Contracts

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Rent |
| **Depends on** | PEAK-231 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/rent/autopay/**`, `lib/commerce/autopay.ts` |
| **Risk** | money / trust |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Option 3 of three: recurring collection via the financial integration.

## Scope
Create a contract against a `rental_agreement`: cadence, amount, start, end.
Both parties review the full schedule before it activates. Cancellation by
either side, with notice. A visible schedule of past and upcoming collections
for both parties.

## Non-negotiable
**`ownerAcceptedAt` and `renterAcceptedAt` must both be set before `active` may
be true.** No money moves on a schedule that one side did not accept. Enforce in
code and with a database CHECK constraint.

## Acceptance criteria
- Given one acceptance, then `active` stays false and nothing is collected.
- Given both, then the provider subscription is created and `providerRef` stored.
- Given cancellation, then no further collection occurs and both are notified.
- Given a failed collection, then both are notified and the contract is not
  silently deactivated.

## Verification evidence
Stripe test mode across at least two cycles, including an induced failure.

## Rollback
Behind `commerce.autopay`.

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

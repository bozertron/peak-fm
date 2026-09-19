# [PEAK-260] Rent: Build Rental

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Rent |
| **Depends on** | **PEAK-222**, PEAK-261 *(feeds it)* |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/rent/build/**` |
| **Risk** | UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Option 1 of three. The direct route, for an owner who already knows their price.

## Scope
Configure the shared composer (**PEAK-222**) for `kind: 'rental'`. Do not fork
it. Rental-specific fields are supplied as config from this ticket's own
files: rate and
`pricingUnit` (day/week/month), deposit, availability calendar, conditions,
minimum and maximum hire period. Publishes a `listing` with `kind = 'rental'`.

Accepts an incoming `roi_model` id from PEAK-261 and pre-fills from it, showing
**only a Review stage** before posting — that hand-off is the point of the
feature, not an extra.

## Acceptance criteria
- Given an exported ROI model, when Build Rental opens from it, then rate,
  conditions and unit are pre-filled and only Review remains.
- Given a published rental, then it appears in `/rent` for that market.
- Given overlapping bookings, then the calendar refuses the second.

## Verification evidence
The ROI → Build → Review → publish path, with the resulting `listing` and the
`roi_model.exportedAt` timestamp pasted.

## Rollback
Behind `surface.rent`.

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

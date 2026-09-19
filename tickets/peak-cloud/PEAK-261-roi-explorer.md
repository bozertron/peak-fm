# [PEAK-261] Rent: Explore ROI

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Rent |
| **Depends on** | none |
| **Blocks** | PEAK-260 |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/rent/roi/**`, `lib/queries/rent.ts`, `lib/roi/**` |
| **Risk** | correctness / trust |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"User can explore the financial reality of the offer and decide if they want to
do it" — and if so, set conditions and price from historical demand plus their
desire to recoup costs. **It exports directly into Build Rental with only a
Review stage before posting.**

This is the most distinctive thing in Rent. An owner arrives not knowing whether
to list at all; every other marketplace assumes they have already decided.

## Scope
- Inputs: acquisition cost, annual maintenance, annual carrying cost, target
  recoup months, expected utilisation.
- **Demand evidence, real not invented:** observed rental activity for the
  category in that market — completed agreements, view and enquiry counts,
  realised rates. When there is not enough local history, say so plainly and
  widen the window or the region, labelled. **Never fabricate a demand curve.**
- Outputs: suggested rate, break-even months, and a scenario table across rate ×
  utilisation, all recomputed on every edit and stored in `roi_model`.
- Conditions decided here carry into the agreement.
- Export sets `listingId` and `exportedAt` and hands off to PEAK-260.

## Honesty rules
1. A suggestion with thin evidence is **labelled as thin**, with n shown.
2. `demandEvidence` records what the numbers were derived from, so a suggestion
   can always be explained.
3. No projection is presented as a guarantee of income.

## Acceptance criteria
- Given a market with no history for a category, then the model says so and does
  not emit a confident rate.
- Given inputs, when any changes, then outputs and the scenario table recompute.
- Given export, then Build Rental opens pre-filled with only Review remaining.

## Verification evidence
Break-even arithmetic unit tests. A thin-evidence case proving the label
appears. Paste the run.

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

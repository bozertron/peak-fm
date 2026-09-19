# [PEAK-213] Listing detail page

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Buy |
| **Depends on** | PEAK-220 |
| **Blocks** | PEAK-210 |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/listing/**` |
| **Risk** | UX / authorization |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Scope
`app/(app)/listing/[id]/page.tsx` — the destination of every listing card on
Buy, Rent and Trade. One page, branching on `kind`:

- media gallery, title, price, category, location, seller identity
- `listing_attribute` values as a readable spec table
- **service listings render the `service_widget` at the top level** — overview,
  pricing tiers, booking tool — per the product spec, not below the fold
- kind-specific action: Buy → question set + purchase (PEAK-211, PEAK-232);
  Rent → availability + request (PEAK-260); Trade → make an offer (PEAK-270)
- a **[Find]** button (PEAK-280) for a sold or unavailable listing
- a report control (PEAK-243)

Next 16: `params` is a Promise — `const { id } = await params`.

## Authorization
- A `draft` listing is visible **only** to its seller.
- A listing whose seller blocked the viewer returns 404, not 403 — a 403
  confirms the listing exists and tells a blocked user they were blocked.

## Acceptance criteria
- Given a draft, when anyone but the seller requests it, then 404.
- Given a blocked viewer, then 404.
- Given a service listing, then the widget renders above the fold.
- Given any card on Buy, Rent or Trade, then its link resolves — and
  `/listing/:id` leaves `KNOWN_MISSING` in this commit.

## Verification evidence
Authorization tests for both 404 cases. `pnpm check:links` with the entry
removed.

## Rollback
Behind the owning surface's flag.

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

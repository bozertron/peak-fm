# [PEAK-213] Listing detail page

- Priority: P0 · Area: Buy · Status: OPEN
- Dependencies: PEAK-220 (needs listings to exist)
- Risk: UX
- **Created by the pressure test.** `components/surface.tsx` links every card to
  `/listing/:id` and that route did not exist in any ticket.

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

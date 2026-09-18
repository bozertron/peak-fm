# [PEAK-260] Rent: Build Rental

- Priority: P1 · Area: Rent · Status: OPEN
- Dependencies: PEAK-220
- Risk: UX

## Intent
Option 1 of three. The direct route, for an owner who already knows their price.

## Scope
Reuse the presentation builder from PEAK-220 with rental fields: rate and
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

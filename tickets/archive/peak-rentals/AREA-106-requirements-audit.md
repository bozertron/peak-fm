> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-106] Explicit requirements audit and design-system coverage

- Priority: P0
- Phase: 1
- Owner: TBD
- Source: User direction pasted in the latest product-design prompt
- Status: Open — audit found that AREA-101 through AREA-105 captured themes, but not every explicit behavior and copy constraint.

## Honesty note
No dedicated “code harvesting” skill was available in the project skill registry. I did not claim to use one. This ticket is based on a direct line-by-line audit of the supplied product direction and the existing ticket set.

## Explicit requirements not previously captured with enough specificity

1. The map must not occupy the full communications space exclusively. It is secondary/contextual UI.
2. The landing page map must show exactly seven sale items with small thumbnails, one-sentence descriptions, and prices formatted as `$XXX`.
3. The connection copy must say “Connected via 7 people in your Circle”; the action must say “Ask for an Intro...” and must hand off to Communications on hover/click behavior as designed.
4. The hero headline must use the exact replacement “The Champagne of Community Communications,” in the existing brown treatment and western display typography.
5. Remove the exact obsolete sentence: “The town square. A bulletin board for the Okanagan, and a private room for your circle.”
6. The Daily Yoddle must appear once in the hero, below peak, with matching spacing; avoid redundant market-facing nomenclature.
7. The header order is peak, Discovery / Good Gear, Good People, and GREAT Community; peak behavior remains unchanged.
8. Good Gear must be removed from all market-facing copy except the Discovery destination/button label.
9. Good People must replace My network; the exact “THE PEOPLE BEHIND THE GEAR / Your network / Trust travels...” block must be removed.
10. Good People requires four equal responsive panels: Work People, Friendly People, Family People, Other People. Each mixes most-accessed contacts with approved positive social updates.
11. The center of those four panels must contain a tastefully sized `peak` over `flow` mark and an entry point to Flow.
12. Flow must cover contact information, transaction details, admin-configured local tax rate, tax obligations, invoices, revenue receipts for completed deals, sales pipeline, related marketing/promotions/assets, and a locally focused sponsored goods/services portal.
13. GREAT Community replaces Cards; remove the exact “PEOPLE YOU’VE COLLECTED / Your cards / Every good interaction...” block.
14. GREAT Community title must support configurable location, including “The GREAT Community! of Big White”; location is user-selectable in Settings and admin-editable.
15. The destination/panel is titled Lexicon and supports resizable tiles, image carousels, approved social feeds, sound/programmed music, ID Widgets, pinned favorites, and Home placement.
16. Communications is for intentional contact/deals; close contacts can use a person’s Card/identity panel for real-time updates and P2P communications.
17. Ask for an Intro must route into the Communications department with source and recipient context preserved.
18. The UI overhaul must use researched UI/UX patterns and make the above-the-fold area useful rather than decorative.

## Acceptance criteria
- Every numbered requirement above is represented in an implementation ticket or explicitly marked deferred with rationale.
- Exact removal strings are absent from source and rendered UI.
- The landing page exposes useful content in each above-the-fold region without the map crowding out Communications.
- Unimplemented financial, social, realtime, and widget capabilities are labeled as planned/unavailable rather than simulated.
- Privacy, authorization, moderation, safe embeds, and server-side persistence are specified before production enablement.

## Verification
- Source search for every removal string and replacement string.
- Desktop 1600x873 and mobile screenshots.
- Keyboard/accessibility pass for all destinations and handoffs.
- Browser interaction tests for Discovery, Good People, Flow entry, GREAT Community, and Ask for an Intro.
- Review ticket coverage against the original prompt before closing this ticket.

## Dependencies
AREA-101, AREA-102, AREA-103, AREA-104, AREA-105.

## Rollout
Keep this as the release gate for the design overhaul. Do not close the wave until every requirement is implemented, explicitly deferred, or moved to a replacement ticket.

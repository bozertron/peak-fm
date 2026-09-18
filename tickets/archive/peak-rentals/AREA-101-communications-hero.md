> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-101] Communications hero and navigation

- Priority: P1
- Phase: 5
- Owner: TBD
- Source requirements: Latest product direction — Communications redesign
- Dependencies: AREA-105
- Risk: UX / accessibility

## Intent
Make Communications the primary above-the-fold experience without redundant market-facing copy.

## Scope
Use The Daily Yoddle as the western-display hero title; retain peak behavior; add Discovery, Good People, and GREAT Community navigation; remove the obsolete trusted-circle explanatory copy and duplicate Good Gear/My network/Cards messaging. Preserve the brown brand treatment and establish a consistent display type style.

## Acceptance criteria
- Given the home route, when Communications is active, then the hero reads “The Daily Yoddle” and the obsolete town-square copy is absent.
- Discovery, Good People, GREAT Community, and Communications are reachable by keyboard and visibly indicate active state.
- No redundant “Good Gear,” “My network,” or “Cards” market-facing headings remain outside their replacement destinations.
- Existing peak home behavior and account controls regress no further.

## Verification evidence
- Browser snapshot and desktop/mobile screenshots.
- Keyboard navigation and accessible-name check.
- Search source for removed copy.

## Additional explicit requirements
- The Communications panel owns the full section; the map is secondary and must not consume the whole section.
- Use the exact headline “The Champagne of Community Communications” in the existing brown western-display treatment.
- Place “The Daily Yoddle” once in the hero below peak with matching spacing; do not repeat redundant market-facing titles.
- Header order is peak, Discovery / Good Gear, Good People, GREAT Community; peak behavior remains unchanged.
- Remove the exact obsolete town-square paragraph and all obsolete explanatory blocks named in AREA-106.

## Rollout and rollback
Ship as additive UI; revert the Communications shell if regression evidence appears.

## Follow-through checkpoints
- Post-merge: verify hero copy and nav routes.
- Deployment: confirm preview rendering at desktop and mobile.
- Monitoring: inspect client console for navigation errors.
- Owner and escalation path: TBD.
                                                                                                                                                

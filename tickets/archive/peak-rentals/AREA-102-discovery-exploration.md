> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-102] Discovery marketplace exploration

- Priority: P1
- Phase: 3
- Owner: v0 implementation
- Status: UI flow implemented; backend persistence pending
- Source requirements: Latest product direction — Discovery / Good Gear
- Dependencies: AREA-101
- Risk: UX / data integrity

## Intent
Turn Discovery into a useful, Tinder-like local marketplace exploration flow.

## Scope
Keep Good Gear only as the Discovery destination label. Show one listing at a time with thumbnail, one-sentence description, price, owner, category, and location. Support skip and thumbs-up actions; a thumbs-up must carry the listing into Communications as a transaction conversation. The map remains secondary to the listing experience and shows nearby inventory context.

## Acceptance criteria
- Given Discovery, when a user opens it, then a listing card is immediately useful without requiring the map.
- Thumbs-up records the selected listing and opens or prepares a Communications transaction context.
- Skip advances without duplicate state changes.
- Price and listing identity come from the authoritative data source when connected; no unsafe client-only transaction state is treated as final.
- Map copy reads “Connected via 7 people in your circle” and the action reads “Ask for an Intro...”.

## Verification evidence
- Browser interaction test for skip, like, and handoff.
- Accessibility check for action labels and image alt text.
- Regression check for search/filter behavior.

## Additional explicit requirements
- The landing-page map/context area must show seven sale items, each with a thumbnail, one-sentence description, and `$XXX` price.
- The map is contextual inventory support, not the dominant full-width experience.
- “Good Gear” may appear only as the Discovery destination/button label in market-facing UI.
- Like/intro actions must preserve source listing, recipient, and originating location for the Communications handoff.

## Rollout and rollback
Feature-gate the handoff if backend persistence is not ready; retain browse-only behavior during rollback.

## Follow-through checkpoints
- Post-merge: verify listing handoff payload.
- Deployment: test with empty and populated inventory.
- Monitoring: log failed handoffs without exposing private data.
- Owner and escalation path: TBD.
                                                                                                                                                

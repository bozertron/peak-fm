> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-104] GREAT Community Lexicon tiles

- Priority: P1
- Phase: 6
- Owner: TBD
- Source requirements: Latest product direction — GREAT Community / Lexicon
- Dependencies: AREA-101
- Risk: content moderation / performance / accessibility

## Intent
Replace Cards with a flexible, community-facing Lexicon of identity tiles.

## Scope
Title the destination “The GREAT Community! of [location]” and the panel “Lexicon.” Support resizable tiles containing image carousels, social updates, sound/music controls, or an ID Widget such as a game, application, or special contact method. Support pinned favorites/home placement, moderation, and safe embed boundaries.

## Acceptance criteria
- Given Community, when opened, then the Lexicon title and location are visible and the obsolete Cards copy is absent.
- Tiles have predictable responsive sizing, keyboard access, alt text, and reduced-motion-friendly media behavior.
- User content is authorized, sanitized, moderated, and isolated from arbitrary script execution.
- Location and branding are configurable by authorized administrators/settings, not hardcoded in user content.

## Verification evidence
- Responsive and keyboard browser QA.
- Content-security and sanitization tests for widgets/media.
- Performance check with representative tile counts.

## Additional explicit requirements
- GREAT Community replaces Cards; remove the exact “PEOPLE YOU’VE COLLECTED / Your cards / Every good interaction...” copy.
- Support a configurable location title such as “The GREAT Community! of Big White”; Settings controls the user location and authorized admin settings control the default branding.
- Lexicon tiles may be resized and may contain image carousels, approved social feeds, audio/programmed music, or an allowlisted ID Widget.
- Support pinned favorites and Home placement without implying that unfinished widget/media features are live.

## Rollout and rollback
Start with safe static tiles; enable interactive widgets behind an allowlist and feature flag.

## Follow-through checkpoints
- Post-merge: verify tile rendering and fallback states.
- Deployment: test admin/location configuration.
- Monitoring: watch widget failures and media load errors.
- Owner and escalation path: TBD.
                                                                                                                                                

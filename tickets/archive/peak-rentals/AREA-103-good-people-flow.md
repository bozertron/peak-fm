> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-103] Good People contact management and flow

- Priority: P1
- Phase: 2
- Owner: TBD
- Source requirements: Latest product direction — Good People and peak → flow
- Dependencies: AREA-105
- Risk: privacy / data / UX

## Intent
Replace the old network/card framing with a useful contact-management foundation.

## Scope
Create four equal panels: Work People, Friendly People, Family People, and Other People. Each panel should support frequently accessed contacts and positive updates supplied through approved integrations. Place peak → flow between the panels as the entry point for contact details, transaction records, tax notes, invoices, receipts, pipeline, promotions, and local sponsored services.

## Acceptance criteria
- Given Good People, when opened, then the four categories and peak → flow are visible and responsive.
- The obsolete “people behind the gear,” “Your network,” and “Your cards” explanatory copy is absent.
- Contact data is private, scoped to the signed-in user, and never exposed through client-only filtering.
- Intro requests and contact opens preserve the selected person when handing off to Communications.
- Financial and tax features are clearly marked as planned or implemented; no fake accounting completion is implied.

## Verification evidence
- Responsive browser screenshots.
- Authenticated authorization tests for contact and transaction records.
- Accessibility checks for panel headings and actions.

## Additional explicit requirements
- Good People replaces My network and must not retain the “THE PEOPLE BEHIND THE GEAR / Your network / Trust travels...” block.
- The four panels are Work People, Friendly People, Family People, and Other People, with most-accessed contacts plus approved positive updates.
- Place the `peak` over `flow` mark between the four panels as the Flow entry point.
- Flow must explicitly model contact details, deal details, admin-configured local tax, tax obligations, invoices, completed-deal revenue receipts, active sales pipeline, promotions/assets, and local sponsored services. Mark unavailable capabilities as planned rather than simulating them.

## Rollout and rollback
Release panels before financial persistence; disable unimplemented flow actions rather than creating misleading records.

## Follow-through checkpoints
- Post-merge: verify category and contact handoff.
- Deployment: test signed-out and signed-in states.
- Monitoring: audit authorization failures.
- Owner and escalation path: TBD.
                                                                                                                                                

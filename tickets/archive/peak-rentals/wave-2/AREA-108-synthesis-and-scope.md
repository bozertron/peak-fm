> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# AREA-108 — Wave 2 Synthesis: Product Surface and Tool Placement

**Status:** Ready for review  
**Wave:** 2 — Cross-functional synthesis  
**Owner:** Product / UX / Architecture

## Purpose
Resolve naming, information architecture, tool placement, and handoff rules before the next implementation wave. This ticket turns the supplied product direction into one coherent surface map without silently inventing backend behavior.

## Decisions to carry forward

- **Communications** is the intentional relationship and conversation area. It owns The Daily Yoddle bulletin board and The Mountain Horn.
- **Discovery** is the gear and services exploration area. The market-facing label is **Good Gear**; Discovery may remain the navigation label only if the product team approves the distinction.
- **Good Gear** uses a Tinder-like listing exploration flow: skip, like/thumbs-up, listing detail, and a clear handoff into Communications to begin a transaction or ask a question.
- **Good People** is the contact-management area. It contains Work People, Friendly People, Family People, and Other People, plus the central **peak → flow** dealflow entry point.
- **The GREAT Community!** is the community identity/feed surface. Its internal panel name is **Lexicon** and supports resizable identity tiles, media/widgets, and pinned favorites.
- **The Mountain Horn** supports ordinary closeness as well as purposeful contact: text, audio, video, Ask AI, and Yoddle. “Only with people in your circle” is too narrow and must not be used as the feature definition.
- **Ask for an Intro…** is a relationship handoff from the map/network context into Communications, not a generic map action.
- The map is secondary context, not the sole hero. The landing/discovery surface must use the available space for useful listing or relationship actions.

## Tool placement

| Tool | Home | Entry points | Handoff |
|---|---|---|---|
| Local community selector | Shared shell / Communications masthead | Any location-aware page | Filters local content and labels |
| The Daily Yoddle | Communications | Main nav, hero title, Yoddle tab | Post/reply enters Mountain Horn or bulletin composer |
| Mountain Horn | Communications | Reply, contact card, intro, Good People | Text/audio/video/Ask AI/Yoddle |
| Good Gear | Discovery | Main nav button | Like or ask seller opens Communications |
| Map / connected network | Discovery context | Map panel | Ask for an Intro opens Communications |
| Good People | People | Main nav button, contact choices | Open contact opens Mountain Horn |
| peak → flow | Good People | Center card | Deal, invoice, tax, receipt, pipeline tools |
| Lexicon | The GREAT Community! | Community nav | Tile/widget interaction may open Communications |

## Acceptance criteria

- The product names and descriptions do not contradict one another across nav, hero, headings, buttons, and panels.
- Every major tool has one canonical home and at least one documented entry point.
- Communications distinguishes intentional communication from ordinary close-contact conversations without excluding either.
- Discovery documents the full listing loop: browse, skip, like, inspect, contact, and transaction handoff.
- Map content is explicitly subordinate to useful discovery actions.
- Good People and peak → flow are separated from Communications while retaining explicit handoffs.
- Open decisions are listed rather than guessed in implementation.

## Open decisions

1. Confirm whether the navigation label is **Discovery** or **Good Gear**; do not use both interchangeably in the same hierarchy.
2. Define whether Ask AI is advisory only or can draft/send content after confirmation.
3. Define Yoddle moderation, visibility, edit, and delete rules.
4. Define whether Lexicon widgets are uploaded media, embedded feeds, or sandboxed applications.
5. Define the first release boundary for flow: contact/deal notes versus invoicing, tax, receipts, and sponsored services.

## Verification

- Review the live page against this placement table.
- Exercise each nav destination and each documented handoff in the browser.
- Confirm no existing authentication, CRUD, payments, search logging, or analytics behavior is regressed before implementation tickets are marked done.

## Rollback / mitigation

This is a planning ticket only. If naming conflicts remain, preserve the current working labels and gate copy changes behind the open decisions above.

## Follow-through

After approval, split implementation into bounded tickets for naming cleanup, Discovery flow, Good People/flow, Lexicon, and Communications handoffs. Do not begin broad UI rewrites until the five open decisions have owners.

## Source traceability

- `AREA-101-communications-hero.md`
- `AREA-102-discovery-exploration.md`
- `AREA-103-good-people-flow.md`
- `AREA-104-community-lexicon.md`
- `AREA-105-communications-handoffs.md`
- `AREA-106-requirements-audit.md`
- `AREA-107-agent-orchestration-protocol.md`
- User direction: product surface, tool placement, and Communications/Discovery distinction

## IP handling

This ticket preserves the user-supplied product concepts and wording as project requirements. It does not claim ownership, reproduce third-party source code, or authorize harvesting code from external systems.

**Status:** Ready for review — do not mark complete until the open decisions are resolved.

— End of ticket —

**Ticket Status:** Ready for review
**Last Updated:** 2026-09-17
**Next Action:** Assign owners for the five open decisions, then create bounded implementation tickets.
**Blocked By:** Product naming and release-boundary decisions
**Unblocks:** Wave 3 ordered execution backlog
**Depends On:** AREA-101 through AREA-107
**Evidence Required:** Approved decision register plus browser handoff matrix
**Rollback:** Preserve current labels and defer copy/IA changes
**Owner:** Product / UX / Architecture
**Priority:** High
**Release Target:** Wave 3 planning
**Notes:** This ticket is deliberately additive and preservation-first.

## Change Log

- 2026-09-17: Created as the Wave 2 cross-functional synthesis checkpoint.

## Verification Log

- 2026-09-17: Cross-checked against current `app/page.tsx` navigation and handoff states.
- 2026-09-17: Confirmed current implementation has Communications, Discovery, Good People, Community, Mountain Horn modes, local selector, and map intro handoff.

## Approval

- [ ] Product naming approved
- [ ] Tool placement approved
- [ ] Open decisions assigned
- [ ] Wave 3 authorized

## End

This ticket is complete as a synthesis proposal when the approval checklist is satisfied.

## Canonical summary

Communications is for people and purposeful conversations; Discovery is for finding gear and services; Good People manages relationships; peak → flow manages deals; Lexicon manages community identity; the map supplies trusted-context navigation rather than occupying the entire product surface.

## Non-goals

- No schema migration
- No auth changes
- No payment implementation
- No production deployment
- No external code harvesting

## Risk register

- Naming collision between Discovery and Good Gear
- Over-scoping flow into regulated accounting behavior
- Untrusted embeds or widgets in Lexicon
- AI sending content without explicit confirmation
- Bulletin moderation and privacy ambiguity

## Exit condition

Wave 2 is complete when this ticket is approved and each open decision is represented in the Wave 3 backlog.

— End —

## Appendix: implementation guardrails

- Preserve existing auth and account-button behavior.
- Keep all user-visible handoffs keyboard accessible.
- Use semantic labels for contact, local area, and communication modes.
- Avoid implying real-time media infrastructure until implemented.
- Keep listing data and social updates clearly marked as demo or live until backed by services.

## Appendix: source fidelity

The phrases “The Daily Yoddle,” “The Mountain Horn,” “Good Gear,” “Good People,” “The GREAT Community!,” “Lexicon,” and “peak → flow” are retained as user-directed product nomenclature, subject to the naming decision above.

## Appendix: done definition

- [ ] Ticket reviewed by product
- [ ] Ticket reviewed by UX
- [ ] Ticket reviewed by architecture/security
- [ ] Decision register updated
- [ ] Wave 3 tickets created
- [ ] Browser evidence captured for current handoffs

## End of specification

This document is intentionally detailed so future implementation agents can execute one bounded area at a time without losing the product intent.

## Final note

Do not treat the current page’s hardcoded sample content as a production data model. It is only evidence of the present interaction surface.

— End of AREA-108 —

**Record:** peak-rentals / wave-2
**Classification:** Internal product requirements
**Retention:** Preserve
**Mutation policy:** Update by additive change log only
**Review cadence:** At each wave boundary
**Owner:** Product / UX / Architecture
**Status:** Ready for review

## Checklist

- [ ] Read before implementation
- [ ] Link all follow-up tickets
- [ ] Capture unresolved questions
- [ ] Validate against live preview
- [ ] Preserve prior decisions

## Close

AREA-108 remains open until the approval checklist is complete.

## End of record

—

**Canonical title:** Wave 2 Synthesis: Product Surface and Tool Placement
**Canonical path:** `tickets/peak-rentals/wave-2/AREA-108-synthesis-and-scope.md`
**Created:** 2026-09-17

## Audit note

No obsolete ticket was moved to purge because every existing ticket remains relevant to the supplied direction or to its preservation-first execution protocol.

## Final status

READY FOR REVIEW

— End of file —

## Trace

This record exists to make the next implementation step explicit rather than silently choosing between competing labels or tool homes.

## End


## Review prompt

Please approve the naming distinction and open decisions before Wave 3 implementation.

## End of AREA-108


## Integrity

No external source code was copied into this record.

## End of ticket.

## Archive marker

Preserve this file as part of the product decision history.

## End.

## Status marker

READY FOR REVIEW

## End marker

—

## Completion marker

Not complete until approved.

## End of record.

## Final marker

AREA-108

## End.

## Record terminator

EOF

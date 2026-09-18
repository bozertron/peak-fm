# [PEAK-243] Member-side reporting

- Priority: P1 · Area: Admin · Status: OPEN
- Dependencies: PEAK-203
- Risk: abuse / trust
- The admin moderation queue works; **nothing creates reports yet.**

## Intent
A marketplace with strangers transacting needs a report path before external
testers arrive, not after the first incident.

## Scope
A report control on listings, messages, users, plans, finds and bulletin posts,
writing `moderation_report`. Structured reasons plus free text. The reporter
sees that it was received; they do **not** see the outcome by default (that is a
policy question — if unclear, raise a decision rather than choosing).

Rate-limit per reporter to prevent report spam being its own abuse vector.

## Acceptance criteria
- Given a report on each entity type, then `entityType` and `entityId` resolve
  to the real object in the admin queue.
- Given repeated reports from one user, then rate limiting applies.
- Given a resolved report, then the audit log records who resolved it and how.

## Verification evidence
One report per entity type, resolved from the admin dashboard, with the audit
rows pasted.

## Rollback
Remove the control; the queue is unaffected.

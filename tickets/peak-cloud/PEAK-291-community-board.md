# [PEAK-291] Plans: Community board

- Priority: P2 · Area: Plans · Status: OPEN
- Dependencies: PEAK-200
- Risk: moderation / trust

## Intent
"This starts as local events + gov't announcements board looking for citizen
feedback."

## Scope
- `community_item` in three kinds: `event`, `announcement`, `consultation`.
- Operator and verified civic accounts can post; `sourceName` and `sourceUrl`
  attribute the origin when there is no member author.
- Consultations open `community_feedback` with an optional stance
  (support / oppose / neutral) until `feedbackClosesAt`.
- An upcoming-events view and a feedback summary per consultation.

## Trust rules
1. **A government announcement must be attributable.** `sourceName` is required
   when `authorId` is null, and `sourceUrl` should point at the original.
2. **Feedback is not anonymous to moderators** but the display policy for other
   members is a product decision — if it is unclear, raise it as a decision
   rather than picking.
3. Closed consultations become read-only; late feedback is refused, not quietly
   dropped.

## Acceptance criteria
- Given an item with no author, when saved without `sourceName`, then it is
  refused.
- Given a consultation past its close date, then the feedback form is absent and
  a direct POST is refused.
- Given a past event, then it is excluded from the upcoming view.

## Verification evidence
Date-boundary tests for close and for past events. Paste the run.

## Rollback
Behind `surface.plans`.

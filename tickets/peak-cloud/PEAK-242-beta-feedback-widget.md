# [PEAK-242] In-app beta feedback widget

- Priority: P1 · Area: Admin · Status: OPEN
- Dependencies: PEAK-203
- Risk: low
- **High value for the cost.** The admin can already read `beta_feedback`; nothing writes it.

## Intent
Testers report where they are confused at the moment they are confused, not
three days later in a message.

## Scope
A persistent control on every surface, open to signed-in users. Kind: bug,
confusion, idea, praise. Captures `surface`, and automatically the route,
viewport and user agent into `context` — a bug report without the route is
usually unusable. Appears immediately in the admin dashboard.

## Acceptance criteria
- Given a submission from `/buy?category=tools-equipment`, then `context`
  records the full route including the query.
- Given a signed-out visitor, then the widget is absent (or anonymous — decide
  and state it in the ticket).
- Given a submission, then it appears in the admin feedback table without a
  deploy.

## Verification evidence
One submission from each surface, with the stored `context` pasted.

## Rollback
Remove the widget; the table and admin view are unaffected.

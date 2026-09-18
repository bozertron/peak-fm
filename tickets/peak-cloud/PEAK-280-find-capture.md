# [PEAK-280] Find: the [Find] button and permanent capture

- Priority: P1 · Area: Find · Status: OPEN
- Dependencies: PEAK-200, PEAK-202
- Risk: data integrity

## Intent
"Wherever applicable, there's a [Find] button. It looks at the meta-data of
where it's coming from, logs it as a permanent opportunity until satisfied."

## Scope
- A reusable `<FindButton>` placed on: an empty Buy result, a listing that is
  sold or unavailable, a plan step, a rental with no local supply, a thread.
- On press it captures `originSurface`, `originEntityType`, `originEntityId`
  and an `originMetadata` snapshot **at that moment** — the filters that
  returned nothing, the plan step that needs a trade, the category being browsed.
- A short confirm step so the seeker can add detail and a budget range.
- The seeker's Find list, with satisfy and withdraw.

## The invariant — enforce, do not just document
> Anything that starts as a Find **ends as a Find.** It never migrates to a Buy
> item, because that would be redundant and would clutter the focused buying
> experience.

There is **no** `convertedToListingId` column in `find_request`, deliberately.
**Do not add one.** Do not add a "promote to listing" action. A Find resolves by
the seeker marking it satisfied — a match does not satisfy it, and neither does
a responder.

## Acceptance criteria
- Given a [Find] press from an empty Buy result, then the failed filter set is
  stored in `originMetadata`.
- Given a match, then `status` may become `matched` but never `satisfied`.
- Given anyone other than the seeker, then they cannot mark it satisfied.
- Given a Find, then no code path creates a `listing` from it.

## Verification evidence
A test asserting no listing is created from any Find path, plus the captured
metadata for each origin surface. Paste the rows.

## Rollback
Behind `surface.find`.

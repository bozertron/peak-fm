# [PEAK-281] Find: matchmaking

- Priority: P2 · Area: Find · Status: OPEN
- Dependencies: PEAK-280, PEAK-210
- Risk: relevance / notification fatigue

## Intent
"Where appropriate acts as a match maker between those looking and those having
the means to satisfy the demand."

## Scope
- On a new listing: find open `find_request` rows it could satisfy.
- On a new Find: find existing listings, service widgets and business plans.
- Score on category, text similarity, budget overlap, market proximity and
  recency. Store the reasoning in `find_match.scoreBasis` so a bad match can
  always be explained.
- Notify with a threshold and a rate limit. A supplier spammed with poor
  matches stops reading them, at which point the feature is worse than absent.
- Suppliers can self-offer against the demand board without being matched.

## Rules
1. **Every score is explainable** from `scoreBasis`. No opaque ranking.
2. **A match is a suggestion.** It does not change the Find's status beyond
   `matched`, and never satisfies it.
3. **Rate-limit notifications per user per day**, configurable.

## Acceptance criteria
- Given a new listing matching three open Finds, then three `find_match` rows
  are created with populated `scoreBasis`.
- Given a match below threshold, then it is stored but not notified.
- Given the daily cap, then further notifications are batched, not dropped
  silently.

## Verification evidence
A fixture set of Finds and listings with expected scores asserted. Paste the run.

## Rollback
Behind `surface.find`. With it off, the demand board still works manually.

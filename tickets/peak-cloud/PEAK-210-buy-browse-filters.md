# [PEAK-210] Buy: category browse and deep filtering

- Priority: P0 · Area: Buy · Status: OPEN
- Dependencies: PEAK-200, PEAK-202, PEAK-220 (needs real listings to browse)
- Risk: performance / UX

## Intent
"Shows a sampling of what's for sale in each category — **however**, it's got
really great filtering options so it's very much zero'd in on what the user is
interested in purchasing."

The browse is table stakes. **The filtering is the differentiator** and is where
the effort goes.

## Scope
- Category rows: per top-level category, a horizontally scrollable sampling with
  a "see all" into the filtered view. Read `category.appliesTo` containing
  `'sale'`; do not hardcode the list.
- Facet filters driven by `listing_attribute`, so adding a facet to a category
  needs no deploy. Facet definitions per category, with types (enum, range,
  boolean) and the counts for each value in the current result set.
- Price range, distance from the user's market centre, goods vs services,
  condition, availability.
- Saved filter sets per user, so a returning buyer resumes their narrowing.
- A **[Find]** button on any filtered view that returns nothing — the empty
  result is the highest-intent moment in the product (PEAK-280).

## Already in place
`lib/queries/listings.ts` `listListings()` does market/kind/status/category/
text/price/offering-type/sort, excludes blocked listings, and fetches cover
images in one round trip. Filter state is already URL-driven. **Extend it; do
not rewrite it.**

## Acceptance criteria
- Given 10,000 listings in a market, when a filtered page renders, then the
  narrowing happens in SQL and the response carries only the page of results.
- Given a filter combination, when the URL is shared, then the recipient sees
  the identical result set.
- Given a facet with no matches in the current set, then it shows a zero count
  rather than disappearing.
- Given a filtered view with no results, then a [Find] call to action is offered.
- Given a listing whose owner blocked the viewer, then it never appears.

## Verification evidence
- Seed 10,000 listings in a scratch database; record query time for the worst
  filter combination and paste `EXPLAIN ANALYZE`.
- Browser test asserting URL round-trip and facet counts.
- `pnpm typecheck && pnpm build && pnpm db:check`.

## Rollback
Feature-flagged behind `surface.buy`. Turn it off in the admin dashboard.

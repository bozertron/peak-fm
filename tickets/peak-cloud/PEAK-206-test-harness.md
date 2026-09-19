# [PEAK-206] Test harness

- Priority: **P0 — blocks the wave** · Area: Platform · Status: OPEN
- Dependencies: none
- Risk: quality at scale

## Why this is first

**There is no test framework in this repository.** No runner, no assertion
library, no `pnpm test`. Meanwhile nineteen open tickets demand "unit tests",
"golden-file tests", "a concurrency test", "an authorization test".

Hand twenty agents those tickets against an empty harness and you get twenty
improvised harnesses. That is unrecoverable at scale — worse than no tests,
because each one looks finished.

## Scope
- Pick a runner and wire `pnpm test` + `pnpm test:watch`. **Recommendation:**
  `node:test` with `tsx`, because the repo already runs plain `.mjs` scripts
  under Node and it adds no framework to learn. Vitest is acceptable if the
  team prefers watch ergonomics; state the choice in the ticket and do not
  leave it implicit.
- A database fixture: create a scratch schema, run `pnpm db:migrate` against
  it, truncate between tests, drop at the end. Tests must **never** run against
  a developer's working database.
- Helpers every ticket will otherwise reinvent:
  - `createUser(overrides)` returning a real row
  - `signInAs(user)` producing a session usable by Server Functions
  - `createListing(overrides)`, `createThread(participants)`
  - `expectRejects(fn, /pattern/)` for the authorization tests
- One worked example per shape, so the pattern is copyable rather than
  described: a query test, a Server Action authorization test, and a
  concurrency test.

## Acceptance criteria
- Given a clean checkout, when `pnpm test` runs, then it creates its own
  database, passes, and leaves no schema behind.
- Given a test that calls a Server Function without a session, then it fails
  with an authorization error rather than a null dereference.
- Given two concurrent writers, then the harness can express the race
  (PEAK-240 needs exactly this).

## Verification evidence
Paste the full `pnpm test` output, and the `psql -c '\dn'` before and after
proving no scratch schema survives.

## Rollback
None needed — additive. But **nothing downstream should be merged before this
lands**, because those tickets cannot satisfy their own acceptance criteria
without it.

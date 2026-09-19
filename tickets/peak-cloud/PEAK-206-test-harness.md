# [PEAK-206] Test harness

|  |  |
|---|---|
| **Wave** | **0** |
| **Status** | OPEN |
| **Area** | Platform |
| **Depends on** | PEAK-201 |
| **Blocks** | **every ticket that must write a test** |
| **Blocked by decision** | — |
| **Files you own** | `tests/**`, `vitest.config.ts` or equivalent; registrar request for `package.json` test scripts and runner dependencies |
| **Risk** | quality at scale |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

PEAK-206 owns the test-runner choice and must give the sequential registrar the
exact `package.json` scripts and dependency versions to apply; that registrar
edit is part of completing this ticket.

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

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint         # once PEAK-207 lands
pnpm typecheck
pnpm build
pnpm test         # once PEAK-206 lands
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

Plus this ticket's own **Verification evidence** above.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If it links to a route that
does not exist yet, add the line with your ticket number. That list may only
shrink.

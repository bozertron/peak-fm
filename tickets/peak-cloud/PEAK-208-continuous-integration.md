# [PEAK-208] Continuous integration

|  |  |
|---|---|
| **Wave** | **0** |
| **Status** | OPEN |
| **Area** | Platform |
| **Depends on** | PEAK-201, PEAK-206, PEAK-207 |
| **Blocks** | **every ticket** (regression safety) |
| **Blocked by decision** | — |
| **Files you own** | `.github/workflows/**` |
| **Risk** | operations |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Why this is separate from PEAK-250

PEAK-250 (deploy pipeline) is blocked on the hosting decision. **CI is not.**
Running the gates on every push needs no deploy target, and a rolling wave with
no CI means every regression is found by a human reading a diff.

There is currently **no `.github/` directory at all**.

## Scope
`.github/workflows/ci.yml`, on push and pull request:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm build`
5. Postgres service container → `pnpm db:migrate` → `pnpm db:check`
6. `pnpm test`
7. `pnpm start` in the background → `pnpm check:links` → `pnpm smoke`

Steps 5 and 7 are the ones that matter most: they are the only gates that catch
the two failure classes this project has actually shipped — a schema that was
never created, and links that 404.

Concurrency group per branch so a new push cancels the previous run.

## Acceptance criteria
- Given a push with a type error, then CI fails at step 3.
- Given a push that drops a table from the schema, then CI fails at step 5.
- Given a push adding a link to a non-existent route, then CI fails at step 7.
- Given a green run, then every gate above actually executed — no skips.

## Verification evidence
**Deliberately break each of the three cases above and paste the failed run
URL.** A gate that has never been seen to fail has not been tested. This is the
same standard PEAK-250 is held to.

## Rollback
Delete the workflow. It gates nothing else.

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

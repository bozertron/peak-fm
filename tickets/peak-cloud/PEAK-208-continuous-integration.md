# [PEAK-208] Continuous integration

- Priority: **P0 — blocks the wave** · Area: Platform · Status: OPEN
- Dependencies: PEAK-206, PEAK-207
- Risk: operations
- **Split out of PEAK-250 deliberately: CI is NOT blocked by D3.**

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

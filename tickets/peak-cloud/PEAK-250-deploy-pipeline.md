# [PEAK-250] Deploy pipeline and predeploy gate

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN — **blocked by D3** |
| **Area** | Platform |
| **Depends on** | PEAK-201, PEAK-208 |
| **Blocks** | nothing |
| **Blocked by decision** | **D3** |
| **Files you own** | `.github/workflows/deploy.yml`, `instrumentation.ts`, `lib/startup.ts`, `app/api/health/route.ts` |
| **Risk** | operations |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
A migration runner that is correct is worth nothing if deploy never calls it.
AREA-109's production 500 happened because no deploy step created the tables and
nothing checked.

## Scope
- CI: `pnpm typecheck`, `pnpm build`, `pnpm db:check` on every push.
- **Predeploy gate: `pnpm db:migrate` then `pnpm db:check`. A non-zero exit
  fails the deploy.** Non-negotiable.
- `instrumentation.ts` calls `lib/startup.ts` once at server startup to assert
  that `DATABASE_URL`, `BETTER_AUTH_SECRET` and
  `BETTER_AUTH_URL` are all set, failing fast and loudly if not.
- Assert `BETTER_AUTH_URL` matches the deployed origin — PEAK-204 documents what
  happens when it does not: every auth call 403s.
- `app/api/health/route.ts` reports database reachability and schema consistency.

## Blocked
**D3** — hosting target. The gate mechanism differs between a Vercel build step
and a container entrypoint. Everything else here can be written now.

## Acceptance criteria
- Given a missing table, then deploy fails before serving traffic.
- Given a missing env var, then the process exits at startup with a message
  naming the variable.
- Given a healthy deploy, then the health endpoint reports schema consistent.

## Verification evidence
Deliberately break the schema in a staging database and paste the failed deploy
output. A gate that has never been seen to fail has not been tested.

## Rollback
Keep the previous release; the gate failing means nothing was deployed.

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

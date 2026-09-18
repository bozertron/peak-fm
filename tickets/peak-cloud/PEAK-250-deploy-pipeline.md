# [PEAK-250] Deploy pipeline and predeploy gate

- Priority: P0 · Area: Platform · Status: OPEN — **blocked by D3**
- Dependencies: PEAK-201
- Risk: operations
- **This is the ticket that closes AREA-109 for good.**

## Intent
A migration runner that is correct is worth nothing if deploy never calls it.
AREA-109's production 500 happened because no deploy step created the tables and
nothing checked.

## Scope
- CI: `pnpm typecheck`, `pnpm build`, `pnpm db:check` on every push.
- **Predeploy gate: `pnpm db:migrate` then `pnpm db:check`. A non-zero exit
  fails the deploy.** Non-negotiable.
- Startup assertion that `DATABASE_URL`, `BETTER_AUTH_SECRET` and
  `BETTER_AUTH_URL` are all set, failing fast and loudly if not.
- Assert `BETTER_AUTH_URL` matches the deployed origin — PEAK-204 documents what
  happens when it does not: every auth call 403s.
- A health endpoint reporting database reachability and schema consistency.

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

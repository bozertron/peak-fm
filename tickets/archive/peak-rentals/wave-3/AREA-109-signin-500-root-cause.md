> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-109] Sign-in 500 root cause and diagnostic-matrix pressure test

- Priority: P0
- Phase: 1 (release gate — blocks all UI work)
- Owner: Orchestrator
- Source: "Peak Rentals — Release-Blocking Diagnostic Matrix" + controlled local reproduction
- Dependencies: none
- Risk: release-blocking / authentication
- Status: Root cause CLASS determined by experiment; leading hypothesis is F6 (no deploy step ever creates the auth tables). F1 corrected 2026-09-18 after an independent code trace.

## Intent

The supplied diagnostic matrix is evidence-complete but untested. This ticket
pressure-tests its declarations against a controlled reproduction, and replaces
its twenty-field evidence package with a single unauthenticated probe.

## Method

The matrix asks for evidence we cannot obtain (server logs for a v0.build
preview). Rather than wait on it, the failure was reproduced locally against
this exact codebase: `next start` on a production build, one environment
variable changed per scenario, capturing HTTP status, response body, and
server stderr.

Reproduction scripts and raw logs: session scratchpad (`experiment.sh`,
`probe.sh`, `scn-*.log`, `probe-*.log`). Commit them to `tickets/peak-rentals/evidence/`
before this ticket closes.

## Findings — evidence table

| # | Scenario | `POST /sign-in/email` | Response body | Server stderr |
|---|---|---|---|---|
| 1 | All config correct, valid credentials | **200** | full JSON session + user | none |
| 2 | All config correct, wrong password | **401** | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` | none |
| 3 | `BETTER_AUTH_SECRET` unset | **500** | **empty** | `BetterAuthError: You are using the default secret.` |
| 4 | `DATABASE_URL` unset | **500** | **empty** | `Could not validate the database schema` / `no PostgreSQL user name specified in startup packet` |
| 5 | `DATABASE_URL` set, auth tables absent | **500** | **empty** | `BetterAuthError: Database schema mismatch` |

### F1 — An empty 500 body separates 500s from 401/403, NOT config from application faults
**CORRECTED 2026-09-18 — the original wording of this finding was unsafe.**

Originally stated: "an empty 500 body is the fingerprint of a configuration
fault." That over-generalised from three config-fault scenarios. An independent
code trace of `better-call` disproved it, and the orchestrator verified the
source directly:

`node_modules/.pnpm/better-call@1.4.0/node_modules/better-call/dist/router.mjs`
catches any exception from the endpoint handler, and for a non-`APIError` logs
`# SERVER_ERROR:` and returns `new Response(null, { status: 500 })` — a
zero-length body. So **application-layer faults with perfectly correct
configuration also return an empty-bodied 500**, including:

- a stored `account.password` not in better-auth's `<hex-salt>:<hex-key>` form
  (seeded or migrated rows) → `Error: Invalid password hash`;
- the database role lacking `SELECT`/`INSERT` on `user`/`session`, which still
  passes the catalog-level schema check → `permission denied for table user`.

What the observation *does* establish: a correctly configured deployment returns
a JSON body on every **expected** outcome, including 401 on a wrong password
(scenario 2). An empty body therefore rules out the normal failure paths and
confirms an *unhandled exception* — but not where it came from. Use F2 and F2b
to locate it.

### F2 — `GET /api/auth/ok` is a zero-cost health oracle
Better Auth mounts `/api/auth/ok`. Measured: `{"ok":true}` + 200 when healthy,
**500 in all three fault scenarios**. It needs no credentials, no payload, no
request ID, no correlation ID, and no server access.

### F3 — `GET /` proves nothing
The landing route returned **200 in all five scenarios**, healthy and broken
alike, because it is statically prerendered. "The site loads but sign-in fails"
is consistent with every hypothesis and must not be treated as evidence.

### F4 — The three config faults are externally indistinguishable from each other
All three produce byte-identical external symptoms (500, empty body, `/ok` 500).
Separating them **requires** one server-side reading. The matrix is correct that
server logs are irreducible — but only for this last narrowing step, after the
probe has already established the fault class.

### F2b — A nonexistent-email sign-in separates config faults from user-row faults
Cheaper and sharper than reading logs, and it works where F2 comes back healthy:

    curl -i -X POST https://<host>/api/auth/sign-in/email \
      -H 'content-type: application/json' \
      -H 'Origin: https://<host>' \
      -d '{"email":"nobody-91723@example.invalid","password":"aaaaaaaa"}'

A **401** proves init, the schema check, the origin check, and a real `SELECT`
against the `user` table all succeeded — so the fault is specific to the real
user's row (bad password hash, or a missing grant on the write path), not the
configuration. A **500** is consistent with the config class. A **403** is an
origin fault, not this incident.

Two load-bearing caveats:
- **Send `Origin` explicitly.** A bare curl has no `Origin`, no cookie and no
  Sec-Fetch headers, so better-auth's CSRF middleware returns without validating
  anything and you silently skip the check you meant to exercise.
- **Space attempts >10s apart.** Production caps `/sign-in*` at 3 requests per
  10 seconds; exceeding it returns 429 and corrupts the probe.

### F6 — Nothing in the deploy pipeline ever creates the auth tables
`package.json` defines `"build": "next build"`. The migration is a separate
script invoked **only** by `scripts/dev-setup.sh` — a local developer script
that never runs on a deploy. A preview pointed at a fresh or different database
therefore has **zero auth tables** while the application code is entirely
correct.

This elevates scenario 5 to the **leading hypothesis** for the reported
incident. It is also the most repeatable of the three: better-auth caches the
rejected schema verdict and rethrows it without re-querying, so it cannot
intermittently recover.

**Structural remedy** (beyond this incident): the migration must run as a deploy
step, or the deploy must fail loudly when the schema is behind. Shipping an
application whose schema provisioning lives only in a developer's local script
guarantees this class of outage.

### F7 — Latent defect: `V0_RUNTIME_URL` is consumed without a scheme
`lib/auth.ts` builds `baseURL` from a fallback chain. `VERCEL_PROJECT_PRODUCTION_URL`
and `VERCEL_URL` are both wrapped as `https://${...}`. **`V0_RUNTIME_URL` is used
raw.** If v0 exposes it as a bare hostname, better-auth's `assertHasProtocol`
throws at init — `Invalid base URL: <host>. URL must include 'http://' or
'https://'` — and every auth request 500s with symptoms identical to a missing
secret. Given the affected host is `*.v0.build`, this is a live candidate.
Fix is one line, but confirm the variable's actual format first.

## Pressure test of the matrix's declarations

| Matrix declaration | Verdict | Basis |
|---|---|---|
| "Do not classify repeated identical 500s as retryable without server evidence" | **UPHELD** | Scenarios 3–5 are deterministic. Retry can never succeed. |
| "Do not patch based solely on opaque browser `c.js` errors, HMR reconnects, or snapshot 404s" | **UPHELD** | Confirmed noise; unrelated to the auth failure surface. |
| Nine checks presented as co-equal peers | **PRIORITY-INVERTED** | "Validate auth configuration" is listed fifth. It is the only check that discriminates, and should run first. |
| **"Rollback is the safest release action"** | **UNSAFE — REJECT** | Every confirmed mode survives a rollback. The config faults are environment-scoped, not code-scoped; the database-resident faults (missing tables, bad password hash, missing grants) are shared across all deployments of that environment. Neither is touched by redeploying older code. See F5. |
| Evidence package of ~20 fields | **DISPROPORTIONATE** | The fault class is resolvable with one unauthenticated GET (F2) plus one nonexistent-email POST (F2b). Neither needs a request ID, correlation ID, HAR, or browser version. |
| Missing-evidence list | **INCOMPLETE** | Omits the decisive items: whether the auth tables exist in the target database (F6, now the leading hypothesis), `NODE_ENV` in the preview, and the result of an unauthenticated `/api/auth/ok`. Note that response **body length**, which an earlier draft of this ticket called decisive, is not — see the F1 correction. |

### F5 — Rollback is not a valid remedy for any confirmed cause
Environment variables are bound to the deployment environment, not the commit.
Rolling back to a "last known-good deployment" carries the same variables and
reproduces the same 500. Worse: if the known-good deployment *does* succeed
under an identical test, that is evidence of **environment drift**, and the
matrix's own decision rule would then direct the operator to ship older code
while leaving the real fault in place. Rollback should be struck from this
incident's remedy set.

## Recommended replacement procedure (supersedes the matrix for this incident)

1. `curl -i https://<preview-host>/api/auth/ok`
   - `{"ok":true}` → init and the schema check both passed. This eliminates the
     entire configuration class in one request. Go to step 2.
   - `500` → configuration fault confirmed. Go to step 3.
2. Run the nonexistent-email probe (F2b), with an explicit `Origin` header.
   - `401` → configuration is fine; the fault is specific to the real user's row.
     Inspect that account's stored `password` format and the DB role's grants.
   - `403` → origin fault, a different incident.
3. Check the target database first — it is the leading hypothesis (F6):
   `select to_regclass('public.user'), to_regclass('public.session'),`
   `to_regclass('public.account'), to_regclass('public.verification');`
   Any `NULL` confirms the missing-tables fault outright. Inability to connect
   points at `DATABASE_URL`; the error text distinguishes the variants
   (`ECONNREFUSED` vs `no pg_hba.conf entry ... SSL off` vs `ERR_INVALID_URL`).
4. List the preview environment's variable **names only** (never values) and
   confirm `BETTER_AUTH_SECRET` and `DATABASE_URL` exist in the Preview scope.
5. Only if 3 and 4 are clean, read the server stderr once and match scenarios 3-5.
6. Re-probe `/api/auth/ok`, then repeat F2b. Do not roll back.

## Acceptance criteria

- `GET /api/auth/ok` on the affected preview returns `{"ok":true}` with status 200.
- `POST /api/auth/sign-in/email` returns 200 for valid credentials and 401 with a
  JSON body for invalid ones — never an empty-bodied 500.
- The specific fault variant (3, 4, or 5) is recorded with its server-side line.
- Reproduction scripts and raw logs are committed under `tickets/peak-rentals/evidence/`.
- The rollback recommendation is formally withdrawn from this incident record.

## Verification evidence

- Controlled five-scenario reproduction, statuses and stderr as tabled above.
- Post-fix probe output.

## Rollout and rollback

Remedy is a configuration change in the deployment environment plus, for
variant 5, a schema migration. **No code rollback.** Preserve the failing
deployment's environment-variable *names* (never values) before changing them.

## Follow-through checkpoints

- Post-fix: `/api/auth/ok` returns 200; one full sign-in round trip succeeds.
- Deployment: add `/api/auth/ok` to the deployment smoke check so this class of
  fault is caught before a human reports it.
- Monitoring: alert on empty-bodied 5xx from `/api/auth/*`.
- Owner and escalation path: Orchestrator; unresolved ambiguity escalates to the user.

## Open questions for the user

1. **Which environment is affected** — the v0.build preview only, or also a
   production deployment? The remedy is environment-scoped, so this sets blast
   radius.
2. **What is `NODE_ENV` in the preview?** It gates three separate behaviours: a
   missing secret is only *fatal* under `production`; which `trustedOrigins`
   branch applies; and whether rate limiting is on. If the preview runs
   `next dev`, the missing-secret hypothesis drops out entirely and is replaced
   by a quieter security defect — sessions signed with better-auth's publicly
   known default secret.
3. **Does `V0_RUNTIME_URL` carry a scheme?** That one fact decides F7, which is
   otherwise indistinguishable from a missing secret from the outside.

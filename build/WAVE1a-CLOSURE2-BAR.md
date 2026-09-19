# WAVE 1a-CLOSURE-2 BAR — make the protections un-removable, and close the false DONE

**Wave:** W-PEAK-01a-closure-2 · **Date:** 2026-09-19 · **Repo:** `/home/bozertron/peak-fm` (HEAD `3288bf7`)
**Why this wave exists:** the closure wave's own blind critics found three things that wave left unproven. All three are real, and
two are the orchestrator's errors rather than a builder's:

1. **The harness sweep is silently removable.** `tests/setup/global-db.ts:737` calls `sweepStaleScratchSchemas(...)`; replacing that
   line with `const swept: string[] = []` leaves the **entire suite green** (170/170) while an orphan survives forever.
   `harness-hygiene.test.ts` calls the sweep function *directly*, so it proves the function and never the lifecycle.
2. **The concurrency test is flaky.** A full-suite run failed `admits exactly maxRedemptions of four concurrent attempts` inside the
   test's own staging barrier ("backend … is blocked behind the gate, but not on the invite update — its statement is a SELECT …"),
   while the same file passed **6/6** in isolation. A flaky concurrency test is worse than none: every future wave would chase ghosts.
3. **PEAK-240 was marked DONE against an artifact that does not exist.** Bar row 240.A7 requires a render proof that the invite field
   appears when the flag is on and is absent when it is off; `grep -rn renderToStaticMarkup tests/` returns **zero**, and the bar's
   own premise ("proven in Wave 0") was unbacked because that probe ran in a scratch directory. The status was withdrawn to
   PARTLY DONE; this wave supplies the artifact so it can honestly return to DONE.

**Not this wave:** PEAK-222 / PEAK-300 (Wave 1b) and everything else.

---

## 0. Environment

| Fact | Value |
|---|---|
| Gates now | `db:check` 38/38 · `typecheck` clean · `lint` exit 0 (91 files) · `pnpm test` **17 files / 170 tests** exit 0 · `build` clean (14 routes) |
| Scoped run form | `pnpm test <path>` — only this form loads `.env.local`. `pnpm exec vitest run <path>` fails with `BETTER_AUTH_SECRET is not set` |
| Residue measured broadly | non-public schemas in `peak`: **none** (a `peak_probe_authz` left by the previous wave's adversarial critic was dropped by the orchestrator, and the narrow `peak_test_%` check that missed it is itself the lesson) |
| Forbidden | reading/editing `.kilo/`, `.next/`, `node_modules/` (research reads of an installed package are fine) |

## 1. Lanes — disjoint, all four parallel-safe

| Unit | Owns | Depends on |
|---|---|---|
| `cx-1` | `tests/invites/concurrency.test.ts` **(MODIFY)** | — |
| `cx-2` | `tests/setup/global-db.ts` **(MODIFY)**, `tests/setup/harness-lifecycle.test.ts` **(NEW)** | — |
| `cx-3` | `tests/invites/sign-up-form.test.ts` **(NEW)** | — |
| `cx-4` | `build/WAVE1a-BAR.md` **(MODIFY)**, `build/WAVE1a-CLOSURE-BAR.md` **(MODIFY)** | — |

**No unit may touch** `package.json`, `pnpm-lock.yaml`, `lib/**`, `app/**`, `components/**`, `drizzle*`, `scripts/**`, or any other
test file. `tests/invites/concurrency.test.ts` belongs to cx-1 alone.

---

## 2. The four closures

### cx-1 — the staging barrier must be deterministic, not lucky

The barrier's job is to **prove concurrency**: two redemptions genuinely in flight, so "exactly one wins" is a race and not a
sequence. Today it reaches that state by *waiting until a backend looks blocked* and then asserting that the blocked backend is
blocked on the invite `UPDATE`. Under full-suite load that observation landed while the backend was still in phase-1's classify
`SELECT` (`readInviteByCode`), and the barrier rejected a legitimate interleaving.

**Required outcome:** the blocked point is **guaranteed by construction**, not observed by timing. The pinned approach — take a row
lock on the invite row from a **third** connection (`SELECT … FOR UPDATE`) before the two contenders run, so each contender's
conditional `UPDATE` blocks deterministically on that lock; release it to let them race. Any better construction is acceptable if
it is justified in the report; **deleting the barrier is not** — it is what makes the test a race proof rather than a sequence.

| # | Requirement | Proof |
|---|---|---|
| cx1.A1 | The barrier no longer depends on *observing* a wait to know it is concurrent | the mechanism is explained in the module header, naming what the old version got wrong |
| cx1.A2 | The test still proves concurrency | a mutation that **serialises** the contenders (await the first fully before starting the second) must make the test FAIL, or the barrier is decorative — state which it does |
| cx1.A3 | The real contract still holds | exactly one of two wins the final use; exactly `maxRedemptions` of four win; the loser's reason is `exhausted`; the stored count and the single `admin_audit_log` row are asserted |
| cx1.A4 | It is stable under load, not just in isolation | **three consecutive full-suite runs** (`pnpm test`, ~153 s each) all green, with the counts pasted for each. Scoped runs alone do not satisfy this row — the failure only appeared under full-suite load |

### cx-2 — the sweep's invocation must be asserted

**Required outcome:** the sequence globalSetup actually performs (sweep → create → migrate → verify) is driven by an exported
function that the test calls, so removing the sweep from that path fails a test — while `globalSetup` keeps doing exactly what it
does now, and the suite's env isolation is preserved.

**Pinned approach:** extract the sequence into an exported `prepareScratchSchema(...)`-style function that `globalSetup` calls and
returns its schema from; `tests/setup/harness-lifecycle.test.ts` pre-creates a **stale-timestamped** schema and a **fresh** one,
calls that function, and asserts the stale one is gone, the fresh one survives, and the run's own schema exists with its 38 tables.
The test must save and restore `PEAK_TEST_SCHEMA` / `PEAK_TEST_DATABASE_URL` / `DATABASE_URL` in a `finally` so no later test file
inherits a different schema, and must drop everything it created.

| # | Requirement | Proof |
|---|---|---|
| cx2.A1 | Removing the sweep from the lifecycle path BREAKS A TEST | paste the output of that exact mutation (replace the sweep call with a no-op → test fails), then the restore and the green run. If it stays green, the gap is still open — say so rather than reporting success |
| cx2.A2 | The sweep still only removes what it recognises and only what is stale | the stale schema goes, the fresh one stays, an unparseable `peak_test_unparseable` survives |
| cx2.A3 | Env isolation holds | the full suite passes **after** the new test has run, proven by running the full suite (not by reasoning about it) |
| cx2.A4 | No behaviour change to the run | the schema is still created, migrated by the real runner (38/38 verified in-schema), and dropped by teardown |

### cx-3 — the 240.A7 artifact

A real test at `tests/invites/sign-up-form.test.ts` that renders `AuthForm` with `renderToStaticMarkup` (proven in this repo's
Wave-0 probe, in a scratch directory — not in-repo, which is the overstatement cx-4 corrects). `AuthForm` is a client component and
imports `next/navigation`'s `useRouter` and `@/lib/auth-client`, so mock those two seams **only** — the same way
`tests/examples/action-authz.test.ts` mocks `next/headers`.

| # | Requirement | Proof |
|---|---|---|
| cx3.A1 | Flag ON + sign-up → the invite field renders | assert on the rendered HTML (the field's label/name and its maxLength/autoComplete attributes) |
| cx3.A2 | Flag OFF + sign-up → the field does NOT render | assert its absence, and assert the normal name/email/password fields still do render, so "absent" is not "rendered nothing" |
| cx3.A3 | Sign-in never shows it, even when `inviteRequired` is true | assert absence for `mode="sign-in"` |
| cx3.A4 | The test can fail | kill-mutation: make the field unconditional → cx3.A2 must FAIL; make it never render → cx3.A1 must FAIL. Paste both |
| cx3.A5 | No new dependency | no jsdom, no happy-dom, no @testing-library; `renderToStaticMarkup` from `react-dom/server` only |

### cx-4 — correct the overstatement

`build/WAVE1a-BAR.md` claims component testing with `renderToStaticMarkup` was "proven in Wave 0". It was proven **by a probe in a
scratch directory** during Wave 0; the repo never carried the artifact, and the string appears in this repository only inside the
bar itself. Correct the claim to say exactly that, and note that the in-repo proof is `tests/invites/sign-up-form.test.ts` (cx-3).
Check `build/WAVE1a-CLOSURE-BAR.md` for the same overstatement and correct it if present. Supersede the text; do not delete the row.

| # | Requirement | Proof |
|---|---|---|
| cx4.A1 | The premise is true after the edit | `grep -rn renderToStaticMarkup` in the repo returns the real test file (and no longer only a bar document) |
| cx4.A2 | Nothing else in either bar is claimed without a check | read both bars and report any other claim you could not reproduce |

---

## 3. Wave hygiene

| # | Requirement |
|---|---|
| D1 | Exactly the lanes above; no registrar-owned file, no `lib/**`, no `app/**`, no `components/**`, no dependency, no table, no migration |
| D2 | Zero TODO/FIXME/placeholder; zero assertion-free tests; zero `.skip`/`.only`/`xit`; zero suppression comments |
| D3 | `pnpm lint` / `typecheck` / `build` / `db:check` / `pnpm test` all green at the end with real output; non-public schema count 0 |
| D4 | No agent committed |

# PEAK — WAVE CLOSE-OUT, 2026-09-19

**Waves closed:** `W-PEAK-00` (foundation) · `W-PEAK-01a` (three extension points) · `W-PEAK-01a-closure` ·
`W-PEAK-01a-closure-2`
**Repo:** `bozertron/peak-fm` · branch `main` · **deferred by the owner's instruction:** `W-PEAK-01b` (PEAK-222 composer +
PEAK-300 threads). No further wave was started.

Every statement here was re-measured on the disk by the orchestrator after the agents stopped. Agent reports are not cited as
evidence; commands and their output are.

---

## 1. What is now true of the tree

| Ticket | State | The evidence that decides it |
|---|---|---|
| **PEAK-206** test harness | **DONE** | `pnpm test` runs a per-process scratch schema (`peak_test_<epochMs>_<pid>`) created and migrated by the **real** `scripts/db-migrate.mjs` (38/38 verified in-schema, 61 foreign keys re-pointed in-schema), dropped by teardown, with a stale-schema sweep at startup |
| **PEAK-207** lint and format | **DONE** | `pnpm lint` exit 0 across 91 files, **no mass reformat**; the nine diagnostics measured on the untouched tree were resolved in real code, no suppressions; `tests/gates/lint-gate.test.ts` is a durable negative control proving the gate can fail |
| **PEAK-208** CI | **PARTLY DONE** | `.github/workflows/ci.yml` — all seven gates, concurrency group, no `continue-on-error`. Written and YAML-validated but **never executed until this push**; the smoke step is expected to fail until the `<Analytics/>` decision lands (§4) |
| **PEAK-230** payment provider seam | **DONE** | `PaymentProvider` matches `docs/PEAK-COMMERCE.md` §2 member-for-member; `ProviderEvent` (a spec gap) defined with a replay-detectable id; the order state machine is total and exhaustively tested; `createPayment` idempotent on `orderId` (one charge **and** an identical `providerRef`); unsigned webhooks rejected and recorded; the resolver **throws** naming D4/PEAK-231 rather than returning a stand-in |
| **PEAK-209** media storage | **PARTLY DONE — backend blocked by D3** | Types, validation, EXIF GPS stripping, a signed single-use local test store, orphan collection and a resolver that throws naming D3. Validation provably runs **before** URL issuance (`createMediaUploadUrl` → `assertUploadAllowed`; the test asserts the store was never asked, with a positive control). The real backend cannot be chosen until hosting is decided |
| **PEAK-240** invite redemption | **DONE** (withdrawn once, earned back) | `beta.invite_only` is enforced **at the real sign-up endpoint**, not in the page: an adversarial critic drove 13 attack classes through `auth.handler()` with **zero user rows created**. The final-use race is proven by a 4-client concurrency test whose barrier is **deterministic by construction**. Bar row 240.A7's render proof now exists on disk |
| **D1** PROHIBITED rule count | **CLOSED** | The canonical block is the 11-rule block; `tickets/doctrine/PROHIBITED.txt` is byte-identical to it (machine-diffed), and the doctrine, the decision register and the history were superseded in place |

## 2. The orchestrator's own verification (not a report)

| Check | Result |
|---|---|
| `pnpm db:check` | **38/38 verified** |
| `pnpm typecheck` | clean |
| `pnpm lint` | exit 0, 91 files |
| `pnpm build` | clean, 14 routes |
| `pnpm test` | **19 files / 174 tests, exit 0** — and **3 consecutive full-suite runs**, all green (this was the row a timed-out critic left unproven; the orchestrator did it instead) |
| `pnpm check:links --allow-known` | "No unowned dead links" |
| Isolation | `public` = 53 base tables, **zero** non-public schemas after every run |
| Lane audit | no registrar-owned file touched; `package.json` and `pnpm-lock.yaml` unchanged by the wave's work except the intentional Wave-0 script/dependency commit |
| **Kill-mutation 1** (sweep removed from the lifecycle) | `tests/setup/harness-lifecycle.test.ts` **FAILS** — `expected true to be false` on the stale-schema assertion. The protection is no longer silently removable |
| **Kill-mutation 2** (the invite race guard removed) | `expected [ {ok:true}, {ok:true} ] to have a length of 1 but got 2`; and `expected 3, got 4` on the four-client case |
| **Kill-mutation 3** (the gate's row lock removed) | the barrier **refuses to proceed**: *"after 15000 ms only 0 of 2 redemption attempt(s) had queued … a serialised pair … never queues here — which is the situation in which a broken read-then-write implementation would pass vacuously. Refusing to release the gate into a race that never staged."* |
| **Kill-mutation 4** (FK re-point removed) | setup fails naming all **61** constraints aimed at `public` |

## 3. Caught by the process, and worth reading

1. **Two blind critics independently found the deepest defect of Wave 1a** — the harness validated uploads with a module that had
   **zero production callers**, so "validated before issuing a URL" was unproven. Two fix rounds closed it; the disk now shows the
   wrapper plus a `not.toHaveBeenCalled()` assertion *with a positive control* so it cannot pass vacuously.
2. **A blind critic caught the orchestrator twice.** A bar row demanded a render proof while the unit's prompt forbade leaving a
   test file — the code shipped unproven and the ticket was marked DONE on the strength of the implementation. That DONE was
   withdrawn (`3288bf7`) and only restored once the artifact existed. Separately, a residue check that counted only
   `peak_test_%` schemas reported "0" while `peak_probe_authz` sat in the database: a narrow check is not evidence of absence —
   the same trap this project enforces on agents.
3. **Every wave produced a finding that a report would have hidden.** Wave 1a's critic found a latent silent-failure branch in
   Better Auth's sign-up route (a 403 returns HTTP 200 with a synthetic success shape when `requireEmailVerification` is set or
   `autoSignIn: false` — and the invite refusal *is* a 403). It is now guarded by a test: flipping **either** knob turns the suite
   red.
4. **The wave-composition toolchain hardened four times.** A broken string continuation silently mangles rendered prompts while
   `node --check` reports PASS; the runtime rejects a script whose *prompt text* contains a nondeterministic clock call; a
   triple-nested shell/node/SQL one-liner is a quoting landmine for a subagent; and a linter rule of mine was matching its own
   documentation. All four are now rules in `wave-prompt-lint.py` (W1, W2, W3, W4, W5, W6, W7, W8) with regression evidence, and
   the lessons are in the `crush-wave-gauntlet-build` skill.

## 4. Mapped, not swept — open items with their state labels

| Item | State | Detail / how to close |
|---|---|---|
| **The invite code's wire transport is unobserved** | **BUILT-UNPROVEN** | `components/auth-form.tsx:71` attaches `x-peak-invite-code`, and the header *name* is proven aligned with the server — but no test observes the attachment (`grep -rn fetchOptions tests/` is empty), so emptying that option would leave the suite green. Repro: empty `fetchOptions` at :71 and run `pnpm test` — it stays green. Close with an assertion on the spy that receives the `signUp.email` call. **First item of the deferred Wave 1b** |
| **`resetTestDatabase()` truncates `current_schema()`** | **MITIGATED, residual path recorded** | `tests/setup/harness-lifecycle.test.ts` documents a real hazard: if `current_schema()` ever resolved to `public`, the harness would TRUNCATE the developer's 53 real tables. The mitigation is real and was observed working — `tests/setup/db-env.ts` throws before any test file loads when the scratch handles are absent (the orchestrator hit exactly that by running the wrong command). **Residual path:** a hand-set `PEAK_TEST_*` naming a schema that does not exist makes Postgres fall back through `search_path` to `public`. A three-line guard refusing to truncate when `current_schema() = 'public'` would end it. Recorded, not silently fixed |
| **A failed test run leaves its schema for up to 2h** | **BY DESIGN, bounded** | Observed: a deliberately failed mutation run left one schema behind. The sweep reclaims it once older than `TEST_SCHEMA_MAX_AGE_MS` (2h). The threshold exists so a sweep cannot race a concurrent run; shortening it trades one failure mode for another |
| **Six SQL identifier-interpolation advisories in `tests/setup/global-db.ts`** | **EXPLAINED, mitigations verified by reading** | `DROP/CREATE SCHEMA` and `ALTER TABLE … DROP CONSTRAINT` cannot take bind parameters — identifiers are not values. Every site routes through `quoteIdentifier()`, which rejects empty/non-string/NUL and **doubles embedded quotes**, and the sweep additionally runs `assertSafeSchemaName()` (`^[a-z_][a-z0-9_]*$`) on names read back from `information_schema`. The analyzer cannot see through the helper. The "TABL typo" advisory is the word "CREATE TABLEs" in a comment |
| **`peak-fm.code-workspace`** | **COMMITTED** | It sat untracked and un-ignored, so a bare `git add -A` would have swept it into an agent's commit — a critic flagged it as exactly that hazard. It is the owner's 60-byte VS Code workspace file, contains no secrets, and is one revert away if unwanted |
| **CI has never executed** | **UNBLOCKED AS OF THIS PUSH** | This push is its first run. PEAK-208's acceptance requires three deliberately-broken runs (type error, dropped table, dead link) as failed-run evidence |
| **The smoke gate vs `<Analytics/>`** | **BLOCKED ON THE OWNER (D3-shaped)** | Production renders `<Analytics/>`; `_vercel/insights/*` 404s off Vercel; `scripts/smoke-test.mjs` exits 1 on *any* console error while its own header documents that 404 as expected. Either guard/remove `<Analytics/>` (registrar-owned) or make the smoke rule tolerate that one documented URL. **Not a builder's call** |
| **`packageManager: pnpm@12.3.4` vs a lockfile written by 11.5.2** | **RECORDED** | CI pins 11.5.2 explicitly, which works around it. `package.json` still declares 12.3.4; `pnpm install --frozen-lockfile` under it is expected to fail. Registrar-owned, deliberately untouched |
| **`package.json` `"name": "my-project"`** | **RECORDED** | A leftover from scaffolding. Cosmetic, out of every ticket's scope, reported rather than silently changed |

## 5. What was deliberately NOT done

- **`W-PEAK-01b` was not started** (owner's instruction): PEAK-222 (shared listing composer, which consumes the media seam) and
  PEAK-300 (threads + the message-renderer registry, the largest surface). Both are unblocked by the disk as it now stands.
- **No decision was taken on D3** (hosting), **D4** (does Peak hold funds), **D5** (BC tax), **D6** (LLM provider) or **D7**
  (native wrapper). Their consequences are visible in the code as loud, named errors rather than silent stand-ins.
- **No reformatting** of the existing tree, no new dependency beyond the two the lint/test gates required, no new table, no
  migration.

## 6. Commits in this close-out

```text
85b4669  [W-PEAK-01a-closure] Harness schema-leak sweep, client-visible refusal, scoped-run doc
3288bf7  [W-PEAK-01a] Withdraw a premature DONE on PEAK-240
08cf832  [W-PEAK-01a] Board: flip 230/240 to DONE, 209 to PARTLY DONE, name the residue
80e36d5  [W-PEAK-01a] Wave 1a: payment seam, media seam interface half, invite enforcement
0125f04  [W-PEAK-00] ignore .vitest/ test-run residue
030437d  [W-PEAK-00] Close D1 with the canonical 11-rule block; docs truth pass
18119de  [W-PEAK-00] Wave 0 foundation gate: test harness, lint/format, CI
```

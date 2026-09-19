# WAVE 1a BAR — the three extension points

**Wave:** W-PEAK-01a · **Date:** 2026-09-19 · **Repo:** `/home/bozertron/peak-fm` (branch `main`, HEAD `0125f04`)
**Tickets:** PEAK-230 (payment provider seam) · PEAK-209 (media storage, interface half) · PEAK-240 (beta invite redemption)
**Derived from:** each ticket's Scope + Acceptance criteria + Verification evidence, plus the Wave-0 foundation that is now on disk.
**Deferred to Wave 1b (not this wave):** PEAK-222 (composer, consumes the media seam) and PEAK-300 (threads, largest surface).
One build wave per run; the orchestrator verifies the disk between them.

This bar is the reference builders build against and **fresh-context critics grade the DISK by**. A critic never reads a
builder's report. A claim with no on-disk artifact and no pasted command output is not a claim that happened.

---

## 0. Environment and foundation, as measured on THIS tree

| Fact | Value |
|---|---|
| Gates | `pnpm lint` / `typecheck` / `build` / `db:check` / `test` all **green**. Test harness: `pnpm test` → 5 files / 19 tests |
| Harness APIs (import these, do not reinvent) | `@/tests/helpers/db` → `testPool()`, `quoteIdentifier()`, `countRows()`, `resetTestDatabase()`, `closeTestPool()` · `@/tests/helpers/factories` → `createUser()`, `createListing()`, `createThread(userIds, overrides?)` · `@/tests/helpers/auth` → `registerUser()`, `signInAs(userId)`, `expectRejects(fn, pattern)`, `DEFAULT_TEST_PASSWORD` |
| Scratch DB | per-process schema `peak_test_<pid>` created/migrated/dropped by `tests/setup/global-db.ts`. **It is truncated per test, so `feature_flag` has NO rows in tests.** |
| Flag convention | `isEnabled(key)` in `lib/queries/market.ts`; **an unknown key is OFF** ("a flag that was never seeded must not read as enabled"). |
| Copyable patterns | `app/admin/actions.ts` (`'use server'`, the `requireAdmin()` guard, the append-only `audit()` insert, the `{ok:true} \| {ok:false;error}` result union) · `tests/examples/*.test.ts` (query, action-authz, concurrency, factories) |
| Component testing | `renderToStaticMarkup` from `react-dom/server` under vitest (proven in Wave 0). **Do NOT add a test dependency** — no jsdom, no happy-dom, no @testing-library. |
| Not available | no `psql` binary, no docker CLI, no Playwright. All DB evidence goes through `pg`/drizzle from Node. |
| Forbidden to read/edit | `.kilo/` (stale detached copies of this repo), `.next/`, `node_modules/` |

## 1. Lanes — one agent, its own files, no exceptions

Every unit below owns **exactly the files listed** and nothing else. Two files is allowed only where listed as a
cohesive pair (implementation + its own dedicated test). No other agent touches those paths.

| Unit | Owns | Depends on |
|---|---|---|
| `209-1` | `lib/storage/types.ts` | — |
| `209-2` | `lib/storage/validate.ts`, `tests/storage/validate.test.ts` | 209-1 |
| `209-3` | `lib/storage/exif.ts`, `tests/storage/exif.test.ts` | — |
| `209-4` | `lib/storage/local.ts`, `tests/storage/local-store.test.ts` | 209-1 |
| `209-5` | `lib/storage/orphans.ts`, `tests/storage/orphans.test.ts` | 209-1 |
| `209-6` | `lib/storage/index.ts`, `tests/storage/index.test.ts` | 209-1..5 |
| `230-1` | `lib/commerce/provider.ts` | — |
| `230-2` | `lib/commerce/state.ts`, `tests/commerce/state.test.ts` | — |
| `230-3` | `lib/commerce/index.ts`, `tests/commerce/index.test.ts` | 230-1 |
| `230-4` | `tests/commerce/fake-provider.ts`, `tests/commerce/provider-contract.test.ts` | 230-1 |
| `240-1` | `lib/invites.ts`, `tests/invites/invites.test.ts` | — |
| `240-2` | `lib/auth.ts` **(MODIFY)**, `tests/invites/enforcement.test.ts` | 240-1 |
| `240-3` | `components/auth-form.tsx` **(MODIFY)**, `app/sign-up/page.tsx` **(MODIFY)** | — |
| `240-4` | `tests/invites/concurrency.test.ts` | 240-1 |

**Explicit lane ruling (named, not silent):** three files are modified even though no ticket's `Files you own` row names
them — `lib/auth.ts` (240-2), `components/auth-form.tsx` and `app/sign-up/page.tsx` (240-3). Each is unclaimed by any
other ticket, each is required by PEAK-240's intent, and each is assigned to exactly one unit here. This is the
orchestrator's lane assignment, recorded in the open so no builder has to guess.

**No unit may touch:** `app/globals.css`, `lib/surfaces.ts`, `lib/db/schema/index.ts`, `components/peak-header.tsx`,
`app/(app)/layout.tsx`, `app/layout.tsx`, `package.json`, `drizzle.config.ts`, `scripts/check-links.mjs`,
`lib/queries/**`, `components/thread/**`, `components/composer/**`.

---

## 2. PEAK-230 — the payment seam

**Pin: the interface is the spec's, verbatim.** `lib/commerce/provider.ts` declares `PaymentProvider` exactly as
`docs/PEAK-COMMERCE.md` §2 prints it: `name`; `createSellerAccount(userId)`; `getSellerStatus(accountRef)`;
`createPayment({orderId, amountCents, currency, buyerId, sellerAccountRef, feeCents})` — **idempotent on `orderId`**;
`capturePayment(providerRef)`; `refundPayment(providerRef, amountCents?)`; `createSubscription({agreementId, amountCents,
currency, cadence: 'weekly'|'biweekly'|'monthly', startAt, endAt?, payerId, sellerAccountRef})`; `cancelSubscription(providerRef)`;
`verifyWebhook(rawBody, signature): Promise<ProviderEvent>`.

**Spec gap you must fill, and say so:** §2 references `ProviderEvent` but never defines it. Define it under these
constraints, and name the gap in your report — do not invent product intent:
- carries a stable provider event `id` (so a replayed webhook is detectable),
- carries the `providerRef` (and `orderId`/`agreementId` where they apply) that joins it to Peak's records,
- maps to a state in `ORDER_STATUSES` from `lib/db/schema/_shared.ts`,
- carries a `Date` and the verified raw payload for audit.

### Acceptance

| # | Requirement | Proof |
|---|---|---|
| 230.A1 | The interface is complete and matches the spec | side-by-side read of `lib/commerce/provider.ts` against §2; `pnpm typecheck` clean |
| 230.A2 | A second provider can be added with **no surface code change** | `lib/commerce/index.ts` resolves a provider by name from configuration; surfaces never import a concrete provider |
| 230.A3 | No secret reaches the client | grep: no `lib/commerce` import from any `'use client'` file; the resolver reads server env only; report what it reads |
| 230.A4 | Duplicate `createPayment` for one `orderId` produces **one** charge | the in-memory provider in `tests/commerce/fake-provider.ts` records charges; the test calls it twice and asserts the charge count is exactly 1 **and** that both calls return the same `providerRef` |
| 230.A5 | Unsigned/invalid webhook is **rejected and logged, never processed** | a test asserts `verifyWebhook` throws for a bad signature and that the rejection is surfaced (the seam exposes the reason); a valid signature parses into a `ProviderEvent` |
| 230.A6 | The order state machine is total: every state's allowed transitions are defined, and illegal ones refuse | `lib/commerce/state.ts` + tests over the full matrix |
| 230.A7 | The DB is the record of intent, the provider the record of fact | the state module never infers payment status from Peak tables; it records what a verified event says |

**State machine pinned (the ticket names the happy path but not the side states — this is the orchestrator's ruling,
flagged for the owner):**

```
pending    → authorized | cancelled
authorized → paid | cancelled
paid       → fulfilled | refunded | disputed
fulfilled  → refunded | disputed
disputed   → refunded            (a dispute that resolves against Peak)
refunded   → (terminal)
cancelled  → (terminal)
```
Any transition not in this table is refused with a named reason. Terminal states refuse everything.

---

## 3. PEAK-209 — media storage (interface half only)

**Pin: this ticket is PARTLY blocked by D3 and stays honest about it.** The interface, validation, EXIF stripping, client
resize contract and orphan collection are buildable now. The **backend** cannot be chosen (Vercel Blob / S3 / R2 all
depend on D3). Therefore:

- `lib/storage/types.ts` declares the ticket's interface verbatim:
  `createUploadUrl({ userId, contentType, maxBytes }) → { uploadUrl, publicUrl, key }` and `delete(key)`.
- `lib/storage/local.ts` is a **local-disk implementation used only by tests**. It is a sanctioned test seam, not a
  production backend — nothing outside `tests/` may import it (a critic greps for this).
- `lib/storage/index.ts` resolves the configured backend and **throws a named, actionable error when none is configured**.
  It must NOT silently fall back to the local store in production. D3 staying undecided is a real state, and the seam
  surfaces it rather than hiding it (rule 2).

### Acceptance

| # | Requirement | Proof |
|---|---|---|
| 209.A1 | Oversized file → **no upload URL is issued** | `validateUpload` refuses on byte size and on content type, with distinguishable reasons |
| 209.A2 | Content type is validated server-side **before** a URL is issued, never after | the issuing function calls validation first; a test proves the store is never asked for a URL when validation fails (assert no store call happened) |
| 209.A3 | GPS EXIF is stripped by default; opt-in keeps it and says so | `stripExifGps(bytes, { keepGps })` is pure; the test **synthesizes** a JPEG carrying an APP1/EXIF segment with a GPS IFD (no binary fixture file), asserts the GPS tags are gone after stripping, that the rest of the image bytes survive, and that `keepGps: true` preserves them |
| 209.A4 | A signed URL expires and **cannot be replayed** | the local store signs a short-lived, single-use URL; a test uses it once, then asserts the second use is refused and an expired signature is refused |
| 209.A5 | Media for an abandoned draft is reclaimable | `listOrphanMedia({ olderThan })` returns media rows whose listing is still `draft` and older than the caller's threshold; `collectOrphanMedia({ olderThan })` deletes from the store **and** removes the rows, reporting counts |
| 209.A6 | No policy is invented | the abandonment window is a **required caller argument** — there is no hidden default, because "how long is abandoned" is the owner's call |
| 209.A7 | Bytes never pass through the Next server | the interface issues URLs and deletes keys; no function in `lib/storage/` accepts a file body other than the pure EXIF/validation helpers |

---

## 4. PEAK-240 — invite redemption (the one that has to be real)

`beta.invite_only` is seeded **ON** and enforced **nowhere** today. Anyone who reaches the URL can register. This wave
closes that, and the closure has to be at the **server**, on the **real** endpoint:

- The client sends the code in a request header, **`x-peak-invite-code`**, via Better Auth's client `fetchOptions`.
- The server enforces it in `lib/auth.ts` — on the sign-up path, before a user row can be created. A Server Action
  guard alone is NOT enforcement: the auth endpoint is publicly reachable and a direct POST must be refused.
- Enforcement is keyed on `isEnabled('beta.invite_only')`. Unknown key = OFF, per the repo's own convention.

**External-API discipline (mandatory):** Better Auth 1.7's real hook/middleware API is the authority. The 240-2 unit must
**read the installed package** under `node_modules/better-auth` and cite the exact file and line it relied on. Never guess
a hook signature.

**Harness safety (mandatory):** the scratch database is truncated per test, so **no `feature_flag` row exists** and
`isEnabled('beta.invite_only')` is `false` — which is exactly why the existing 19 tests keep working. 240-2 must run the
**full** suite, not only its own test, and report the counts.

### Acceptance

| # | Requirement | Proof |
|---|---|---|
| 240.A1 | Flag ON and no code → sign-up is refused | a test POSTs to the auth sign-up path with no invite header and asserts the refusal, and asserts **no user row was created** |
| 240.A2 | Revoked, expired and exhausted codes are refused with **distinguishable** reasons | `redeemInvite` returns a discriminated result (`missing` / `revoked` / `expired` / `exhausted` / `email-mismatch`); one test per reason asserts the specific value |
| 240.A3 | An invite naming an email only works for that email | mismatch refused, match accepted |
| 240.A4 | Concurrent redemption of the **final** use → exactly one succeeds | a real concurrency test with two independent pool clients: one conditional `UPDATE ... WHERE "redemptionCount" < "maxRedemptions" AND "revokedAt" IS NULL` wins, the loser is refused, and the stored count is exactly `maxRedemptions`. Mirrors `tests/examples/concurrency.test.ts` — reuse its technique, and assert the affected-row count |
| 240.A5 | Success writes `redemptionCount`, `redeemedById`, `redeemedAt` **and** an `admin_audit_log` row | read the rows back and assert all four |
| 240.A6 | Flag OFF → sign-up proceeds with no code | the default state of the scratch DB; assert sign-up succeeds |
| 240.A7 | The form only asks for a code when the flag is on | `renderToStaticMarkup` of the sign-up page/form with the flag on and off — field present, field absent |
| 240.A8 | The existing suite still passes | `pnpm test` counts before and after, pasted |

---

## 5. Wave hygiene (every unit)

| # | Requirement |
|---|---|
| D1 | Exactly the files in the lane table. No builder touched a registrar file or another unit's file |
| D2 | Zero TODO/FIXME/placeholder; zero assertion-free tests; zero `.skip`/`xit`/`todo` |
| D3 | Zero suppression comments (`biome-ignore`, `@ts-ignore`, `eslint-disable`) and no weakening of a gate |
| D4 | No new dependency, no new table, no drizzle migration, no `package.json` change. **If you believe you need one, STOP and report** |
| D5 | `pnpm lint` / `typecheck` / `build` / `db:check` / `test` all still green at the end of the wave |
| D6 | No agent committed |
| D7 | Every "this is a test double" is confined to `tests/` and every production path fails loudly rather than falling back to one |

## 6. Out of scope for this wave

- PEAK-222 and PEAK-300 (Wave 1b), and every surface ticket.
- Choosing the media backend (**D3**), holding funds (**D4**), tax (**D5**), LLM provider (**D6**).
- The open CI/smoke item from Wave 0 (`<Analytics/>` vs the smoke rule) — owned by the orchestrator and the owner.

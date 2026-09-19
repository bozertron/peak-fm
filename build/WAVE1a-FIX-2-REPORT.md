# WAVE 1a — FIX ROUND 2 (PEAK-209 / bar 209.A2) — STALE FINDING, ALREADY CLOSED

**Fixer:** fix-round-2. **Repo:** `/home/bozertron/peak-fm` · branch `main` · HEAD `0125f04` (unchanged — no agent commits).
**Source files touched by this round: NONE.** The only file written is this report.
**Reason:** the largest gap assigned to this round is **already closed on disk** by `WAVE1a-FIX-1-REPORT.md`
(`lib/storage/index.ts` + `tests/storage/index.test.ts`, mtimes 22:28 / 22:27, i.e. written *after* the critics graded).
Per the fix-round rules ("Reproduce the gap yourself FIRST … if you cannot reproduce it, STOP and report that — a stale
critic finding must not cause a destructive change"), I reproduced the critic's own commands, found the gap does not
exist, independently re-verified the fix with a kill-mutation, and re-ran every gate. I made **no** source edit.

---

## 1. GAP REPRODUCED — it could NOT be reproduced (it is stale)

The critic's exact repro command, run on this disk:

```
$ grep -rln "validateUpload\|assertUploadAllowed" lib/ app/ components/ --include=*.ts --include=*.tsx | grep -v "lib/storage/validate.ts"
lib/storage/index.ts
grep exit=0
```

The critic reported **nothing**; the disk now returns `lib/storage/index.ts`. The gate therefore **has a production
consumer** — the "ZERO production callers" half of the gap is gone.

```
$ grep -rn "toHaveBeenCalled\|spyOn\|vi.fn" tests/storage tests/commerce tests/invites
tests/storage/index.test.ts:35: *      store was demonstrably never even resolved       → `not.toHaveBeenCalled()`
tests/storage/index.test.ts:36: *                                              + `toHaveBeenCalledTimes(1)`
tests/storage/index.test.ts:406:  const createUploadUrl = vi.fn<
tests/storage/index.test.ts:418:  const deleteKey = vi.fn<(key: string) => Promise<void>>(async (key: string) => {
tests/storage/index.test.ts:457:    expect(createUploadUrl).not.toHaveBeenCalled()
tests/storage/index.test.ts:458:    expect(deleteKey).not.toHaveBeenCalled()
tests/storage/index.test.ts:476:    // Without this control the `not.toHaveBeenCalled()` assertions above would also
tests/storage/index.test.ts:478:    expect(createUploadUrl).toHaveBeenCalledTimes(1)
tests/storage/index.test.ts:479:    expect(deleteKey).not.toHaveBeenCalled()
grep exit=0
```

The critic reported **nothing** here (its grep was `tests/storage tests/commerce tests/invites`); the disk now carries the
bar's mandated assertion — `expect(createUploadUrl).not.toHaveBeenCalled()` — plus the positive control at `:478`, which is
what stops "never called" from passing for an implementation that never calls a store at all.

**Conclusion: the finding is stale, not real. No destructive change was made.**

## 2. WHY IT HAPPENED (why the critic saw an open gap and this round does not)

The three critics graded the disk **before** fix-round-1 ran. `WAVE1a-FIX-1-REPORT.md` was written at 22:35 and its two
artifacts at 22:27–22:28, while the bar itself was written at 20:50 — the critic session measured the pre-fix tree. The
harness then re-issued the *same* original critic verdict as fix-round-2's assignment without re-grading. So the
"largest gap" text is a snapshot of a disk that no longer exists.

Fix-round-1 closed both halves of the gap:

- **Production caller.** `lib/storage/index.ts:426` now exports `createMediaUploadUrl(request, store?)` — the issuing
  function. It calls `assertUploadAllowed(...)` at `:434` **first** and only then resolves the store (`:441`) and asks
  `target.createUploadUrl(...)` (`:442`). Because the store is resolved *after* the gate, an invalid candidate is refused
  with the **gate's** reason and no store is ever built or asked.
- **The mandated proof.** `tests/storage/index.test.ts:405–558` adds `recordingStore()` (a `vi.fn()`-backed `MediaStore`)
  and 7 tests: four refused candidates each assert the gate's refusal text **and**
  `expect(createUploadUrl).not.toHaveBeenCalled()` (`:457`), plus a positive control (`:478`), a no-store-injected
  ordering proof (`:490`), and a real-resolved-store test (`:521`).

## 3. THE FIX (by fix-round-1, verified here — no edits by this round)

| File | Location | What it is |
| --- | --- | --- |
| `lib/storage/index.ts` | `:116` | `import { assertUploadAllowed } from './validate'` — production consumer of the gate |
| `lib/storage/index.ts` | `:385` | `MediaUploadRequest` — the gate's inputs (`bytes` required, per 209.A1) |
| `lib/storage/index.ts` | `:426` | `createMediaUploadUrl(request, store?)` — gate at `:434`, store resolved at `:441`, store asked at `:442` |
| `tests/storage/index.test.ts` | `:405` | `recordingStore()` — `vi.fn()` store that records what it was asked |
| `tests/storage/index.test.ts` | `:457` | `expect(createUploadUrl).not.toHaveBeenCalled()` — the bar's mandated assertion |
| `tests/storage/index.test.ts` | `:478` | `expect(createUploadUrl).toHaveBeenCalledTimes(1)` — positive control |

No new dependency, no new table, no migration, no `package.json` change, no assertion weakened, no suppression comment,
no `.skip`/`todo`. **This round added none of these and changed no source file.**

## 4. PROOF — the critic's gate, independently re-verified

### 4a. The fix is not cosmetic: kill-mutation removes the gate

I copied `lib/storage/index.ts` to `/tmp`, replaced the `assertUploadAllowed({...})` call in `createMediaUploadUrl` with
`const contentType = request.contentType` (the pre-fix shape the critic described), and ran the file:

```
$ pnpm test tests/storage/index.test.ts      # mutated
     × refuses an oversized file without ever asking the store for a URL 18ms
     × refuses an unsupported content type without ever asking the store for a URL 4ms
     × refuses a zero-byte file without ever asking the store for a URL 3ms
     × refuses a limit that is not a positive whole number of bytes without ever asking the store for a URL 6ms
     × positive control: a valid candidate DOES ask the store exactly once, for the normalised type 3ms
     × resolves the store only AFTER the gate — with no store injected, an invalid candidate is refused by the gate, not by D3 3ms
     × issues a working URL through the REAL resolved store, and a refusal through that same path never reaches the store’s own checks 6ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯
AssertionError: promise resolved "{ …(3) }" instead of rejecting
AssertionError: expected { userId: 'seller-1', …(2) } to deeply equal { userId: 'seller-1', …(2) }
AssertionError: expected [Function] to throw error matching /upload refused \[too-large\]/ but got 'PEAK_MEDIA_BACKEND is not set, so no …'
 Test Files  1 failed (1)
      Tests  7 failed | 14 passed (21)
```

**Restored** from `/tmp/fix2-index.ts.orig`; `md5sum lib/storage/index.ts` →
`285361e1eac3d624b1571817f1c81b0f` (identical to the pre-mutation value). Re-run after restore:

```
$ pnpm test tests/storage/index.test.ts
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

So the tests measure the real gate, not a render — they fail the instant the gate is removed.

### 4b. Full gate (bar D5)

```
$ pnpm test
 Test Files  16 passed (16)
      Tests  161 passed (161)
```

(The biome error block printed mid-run is the **pre-existing** negative control inside `tests/gates/lint-gate.test.ts`,
which deliberately lints a dirty fixture in `/tmp/peak-lint-gate-*` to prove the lint gate can fail. It is expected
output; the run itself is `16 passed / 161 passed`.)

```
$ pnpm lint
$ biome lint .
Checked 90 files in 163ms. No fixes applied.

$ pnpm typecheck
$ tsc --noEmit
typecheck exit=0

$ pnpm build
 ✓ Compiled successfully in 342ms
 ✓ Generating static pages using 7 workers (14/14)
build exit=0

$ pnpm db:check
==> Verifying schema against lib/db/schema/
    38/38 table(s) verified
Schema is consistent.
```

### 4c. Tree is untouched by this round

`md5sum` after every command in this session: `lib/storage/index.ts 285361e1eac3d624b1571817f1c81b0f`,
`tests/storage/index.test.ts 860771ff0984864887a4fd04eb73727d`, `lib/storage/validate.ts 731cef69b59de5d1f921a92a5f872fe3`.
`git status --porcelain -uall` shows only the wave's own lane files + `build/WAVE1a-BAR.md` + `WAVE1a-FIX-1-REPORT.md` +
`peak-fm.code-workspace` (pre-existing debris) + this report. No new source file, no deleted file, no conflict marker.

## 5. ANYTHING STILL OPEN

- **The bar item 209.A2 is met.** Both clauses of its proof column — "the issuing function calls validation first" and
  "a test proves the store is never asked for a URL when validation fails" — are satisfied and independently
  kill-mutation-verified.
- **Not a defect, an owner call (unchanged from FIX-1's §6):** a surface *could* still call
  `getMediaStore().createUploadUrl(...)` directly and bypass the gate. The gate now has a real consumer and the bypass is
  greppable, but making it structurally impossible would change the bar's pinned `209-6` surface (`getMediaStore` is
  exported) — the orchestrator's/owner's call, not a fix-round edit, and outside this round's one gap.
- Secondary doctrine defects the critics listed (exif.ts's dangling "see SPEC GAPS in the builder report" pointer;
  `docs/PEAK-COMMERCE.md` §2's stale `TO BE IMPLEMENTED` comment; the `ProviderEvent` vocabulary; 209.A7's wording vs the
  test seam) are **not** this round's largest gap and were not touched.
- Process: no reusable script was created (the mutation was a one-shot inline edit, reverted in-session), so nothing
  unregistered was left in `/tmp`; the only scratch artifact is `/tmp/fix2-index.ts.orig`.

---

UNIT: PEAK-209 bar 209.A2 (issuing function calls validation first; store never asked on refusal)
FILES: `/home/bozertron/peak-fm/build/WAVE1a-FIX-2-REPORT.md` (only). No source edits — gap already closed by `WAVE1a-FIX-1-REPORT.md`.
STATUS: stopped-ambiguous (stale assignment: the assigned largest gap is already closed on disk; per the rules I reproduced, could NOT reproduce the gap, and made no destructive change)
COMMANDS RUN:
  grep -rln "validateUpload\|assertUploadAllowed" lib/ app/ components/ --include=*.ts --include=*.tsx | grep -v "lib/storage/validate.ts"
  grep -rn "toHaveBeenCalled\|spyOn\|vi.fn" tests/storage tests/commerce tests/invites
  cp lib/storage/index.ts /tmp/fix2-index.ts.orig ; (python inline gate-removal mutation) ; pnpm test tests/storage/index.test.ts ; cp /tmp/fix2-index.ts.orig lib/storage/index.ts ; md5sum
  pnpm test tests/storage/index.test.ts
  pnpm test
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm db:check
OUTPUT: (verbatim tails, post-restore)
  grep #1 → `lib/storage/index.ts` (exit 0)
  grep #2 → 10 hits incl. `tests/storage/index.test.ts:457: expect(createUploadUrl).not.toHaveBeenCalled()` and `:478: ...toHaveBeenCalledTimes(1)`
  mutated storage/index.test.ts → `Test Files 1 failed (1) / Tests 7 failed | 14 passed (21)`
  restored md5 → `285361e1eac3d624b1571817f1c81b0f`
  pnpm test → `Test Files 16 passed (16) / Tests 161 passed (161)`
  pnpm lint → `Checked 90 files in 163ms. No fixes applied.`
  pnpm typecheck → exit 0
  pnpm build → `✓ Compiled successfully in 342ms` / `✓ Generating static pages using 7 workers (14/14)`
  pnpm db:check → `38/38 table(s) verified` / `Schema is consistent.`
MUTATION RESULT: Removed the `assertUploadAllowed` call from `createMediaUploadUrl` in `lib/storage/index.ts` → 7 tests failed (the four `not.toHaveBeenCalled()` refusals, the positive control, the no-store-injected ordering proof, and the real-resolved-store test). Reverted from `/tmp/fix2-index.ts.orig`; md5 identical (`285361e1…`); file re-run green (`21 passed (21)`).
UNSURE / BLOCKED: none. The assigned finding is stale (predates fix-round-1), and I did not fabricate a change to satisfy it.
SPEC GAPS FOUND: none new. 209.A2's proof is fully specified and now fully satisfied.

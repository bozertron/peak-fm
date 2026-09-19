# WAVE 1a — FIX ROUND 1 (PEAK-209 / bar 209.A2)

**Fixer:** closing the single largest gap named by the wave's three blind critics.
**Repo:** `/home/bozertron/peak-fm` · branch `main` · HEAD `0125f04` (unchanged — no agent commits).
**Files touched:** `lib/storage/index.ts`, `tests/storage/index.test.ts`, this report. Nothing else.
**Owned lane:** 209-6 (`lib/storage/index.ts`, `tests/storage/index.test.ts`) — both files are the lane's own
implementation+test pair from the bar's lane table, so the fix adds no file the bar does not already assign.

---

## 1. GAP REPRODUCED

The critic's exact repro command, run on the wave's disk before any change
(`git log -1` → `0125f04d1770638d5ad5c92ea917befe10b0cc47`):

```
$ grep -rn "assertUploadAllowed\|validateUpload" lib app components --include='*.ts' --include='*.tsx'
lib/storage/validate.ts:113:export function validateUpload(input: UploadCandidate): ValidationResult {
lib/storage/validate.ts:170: * use `validateUpload` directly.
lib/storage/validate.ts:172:export function assertUploadAllowed(input: UploadCandidate): SupportedContentType {
lib/storage/validate.ts:173:  const result = validateUpload(input)
exit=0

$ grep -rn "toHaveBeenCalled\|spyOn\|vi.fn(" tests/storage
exit=1
```

**Confirmed real, and not stale.** The gate existed and was correct, but it had **zero production consumers**:
nothing outside `validate.ts` called it. `MediaStore.createUploadUrl` (`lib/storage/local.ts:562`) does its own
content-type/limit checks, but it never routes through `validate.ts` and — critically — the ticket's
`createUploadUrl` signature carries **no `bytes`**, so the store *cannot* refuse an oversized file. A refusal
could only happen after a URL was already minted, which is precisely what 209.A2 forbids ("validated server-side
**before** a URL is issued, never after"). `validate.ts`'s own doc comments asserted, in the present tense, that
`assertUploadAllowed` is "Used immediately before `MediaStore.createUploadUrl`" — a claim that was false on that
disk. Neither half of the bar's proof column ("the issuing function calls validation first; a test proves the
store is never asked for a URL when validation fails") existed.

## 2. WHY IT HAPPENED

`validate.ts` was built as a pure predicate module (correctly — its test pins its export surface to exactly two
functions and forbids I/O), but the wave never built the **composition** of the gate with the store. The bar's
lane table splits the seam into six units (types, validate, exif, local, orphans, resolver); the only unit that
knows both `validate.ts` and the store resolution is 209-6 (`lib/storage/index.ts`, "THE RESOLVER"), and it
resolved a store without ever being the thing that issues a URL. So the gate had no caller, and the issuing path
had no gate.

## 3. THE FIX

`lib/storage/index.ts` — the issuing function now exists, and the order is the contract.

| Line | Change |
| --- | --- |
| `116` | `import { assertUploadAllowed } from './validate'` — the resolver is the one module that can compose the gate with the store |
| `385` | `export interface MediaUploadRequest { userId; contentType; bytes; maxBytes }` — the gate's inputs plus the owner the URL is signed for. `bytes` is required: a URL is issued *before* bytes arrive, so without a claimed size no limit can refuse anything (209.A1) |
| `426` | `export async function createMediaUploadUrl(request, store?)` — **THE ISSUING FUNCTION**: (1) `assertUploadAllowed` first (line `434`), (2) only then `const target = store ?? getMediaStore()` (line `441`) and `target.createUploadUrl({ userId, contentType, maxBytes })` with the **normalised** type the gate returned, never the raw client string |
| `15-19` | module header updated so its "exports exactly the ticket's surface" sentence stays true |

Why this shape and not an edit inside the store: the bar's proof column requires that **the store is never
asked** — so the gate cannot live inside `createUploadUrl` (the store would already have been asked). Resolving
the store *after* the gate is deliberate and observable: outside a test with no backend configured, an invalid
candidate is now refused with the **gate's** reason instead of being masked by the D3 refusal that would have
thrown first had the order been reversed.

`tests/storage/index.test.ts` — the missing half of the proof (lines `405`–`558`), 7 new tests:

1. `recordingStore()` (`:405`) — a `vi.fn()`-backed `MediaStore` that records what it was asked.
2. `it.each` over four refused candidates (`:435`): oversized, unsupported content type, zero-byte, invalid
   limit — each asserts the **gate's** refusal text **and** `expect(createUploadUrl).not.toHaveBeenCalled()`.
3. Positive control (`:462`): a valid candidate **does** ask the store exactly once, and the recorded call is
   `{ userId, contentType: 'image/jpeg', maxBytes }` for input `'IMAGE/JPEG; charset=utf-8'` — without this
   control, "never called" would also pass for an implementation that never calls a store at all.
4. Ordering proof with **no** store injected (`:490`): in a production-shaped environment with no backend, an
   invalid candidate is refused by the gate, while the same environment with a valid candidate gets
   `MediaBackendUnavailableError` — proving the store is not even resolved for an invalid candidate.
5. Real-resolved-store test (`:521`): a valid candidate issues a working URL on the local seam, the bytes
   upload and the key appears; an oversized candidate is refused (the store cannot see `bytes` at all) and
   adds no key; an unsupported type is refused with `validate.ts`'s wording and is **not** a
   `LocalMediaStoreError` — direct evidence the store's own check never ran.

No new dependency, no new table, no migration, no `package.json` change, no assertion weakened, no existing
test altered, no `.skip`/`todo`, no suppression comment.

## 4. PROOF — the critic's own gate, re-run

```
$ grep -rn "assertUploadAllowed\|validateUpload" lib app components --include='*.ts' --include='*.tsx'
lib/storage/validate.ts:113:export function validateUpload(input: UploadCandidate): ValidationResult {
lib/storage/validate.ts:170: * use `validateUpload` directly.
lib/storage/validate.ts:172:export function assertUploadAllowed(input: UploadCandidate): SupportedContentType {
lib/storage/validate.ts:173:  const result = validateUpload(input)
lib/storage/index.ts:116:import { assertUploadAllowed } from './validate'
lib/storage/index.ts:403: *   1. judge the candidate — `assertUploadAllowed` throws on a refusal; and only
lib/storage/index.ts:416: * The store is handed the NORMALISED type `assertUploadAllowed` returned — never the
lib/storage/index.ts:434:  const contentType = assertUploadAllowed({
grep exit=0

$ grep -rn "toHaveBeenCalled\|spyOn\|vi.fn(" tests/storage
tests/storage/index.test.ts:35: *      store was demonstrably never even resolved       → `not.toHaveBeenCalled()`
tests/storage/index.test.ts:36: *                                              + `toHaveBeenCalledTimes(1)`
tests/storage/index.test.ts:457:    expect(createUploadUrl).not.toHaveBeenCalled()
tests/storage/index.test.ts:458:    expect(deleteKey).not.toHaveBeenCalled()
tests/storage/index.test.ts:476:    // Without this control the `not.toHaveBeenCalled()` assertions above would also
tests/storage/index.test.ts:478:    expect(createUploadUrl).toHaveBeenCalledTimes(1)
tests/storage/index.test.ts:479:    expect(deleteKey).not.toHaveBeenCalled()
grep exit=0
```

Storage suite (note `75` where the critic measured `68` — the 7 new assertions):

```
$ node --env-file-if-exists=.env.local ./node_modules/vitest/vitest.mjs run tests/storage
 Test Files  5 passed (5)
      Tests  75 passed (75)

$ node --env-file-if-exists=.env.local ./node_modules/vitest/vitest.mjs run tests/storage/index.test.ts
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

Full wave gates on the fixed disk:

```
$ pnpm lint
$ biome lint .
Checked 90 files in 171ms. No fixes applied.
exit=0

$ pnpm typecheck
$ tsc --noEmit
exit=0

$ pnpm build
exit=0     (14/14 static pages, every route compiled)

$ pnpm db:check
==> Verifying schema against lib/db/schema/
    38/38 table(s) verified
Schema is consistent.

$ pnpm test
 Test Files  16 passed (16)
      Tests  161 passed (161)
```

`pnpm test` prints a biome error block while running; that is the **pre-existing** negative control in
`tests/gates/lint-gate.test.ts` deliberately linting a dirty fixture in `/tmp/peak-lint-gate-*` to prove the
lint gate can fail. It is expected output, not a failure — the run itself is `16 passed / 161 passed`, and
`pnpm lint` over the repo is clean.

## 5. MUTATION RESULT

Two mutations, both on `lib/storage/index.ts`, both reverted; `md5sum` identical to the pre-mutation values
(`index.ts 285361e1eac3d624b1571817f1c81b0f`, `index.test.ts 860771ff0984864887a4fd04eb73727d`) — verified by
`diff` against the baseline captured before mutating.

**Mutation 1 — resolve the store BEFORE the gate** (`const target = store ?? getMediaStore()` moved above the
`assertUploadAllowed` call):

```
 ❯ tests/storage/index.test.ts (21 tests | 1 failed)
     × resolves the store only AFTER the gate — with no store injected, an invalid candidate is refused by the gate, not by D3
AssertionError: expected [Function] to throw error matching /upload refused \[too-large\]/ but got 'PEAK_MEDIA_BACKEND is not set, so no …'
 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```
Reverted → `21 passed (21)`.

**Mutation 2 — remove the gate entirely** (the pre-fix disk: `const contentType = request.contentType` handed
straight to the store):

```
 FAIL  … > refuses an oversized file without ever asking the store for a URL
 FAIL  … > refuses an unsupported content type without ever asking the store for a URL
 FAIL  … > refuses a zero-byte file without ever asking the store for a URL
 FAIL  … > refuses a limit that is not a positive whole number of bytes without ever asking the store for a URL
 FAIL  … > positive control: a valid candidate DOES ask the store exactly once, for the normalised type
 FAIL  … > resolves the store only AFTER the gate — with no store injected, an invalid candidate is refused by the gate, not by D3
 FAIL  … > issues a working URL through the REAL resolved store, and a refusal through that same path never reaches the store’s own checks
LocalMediaStoreError: upload refused [unsupported-content-type]: "IMAGE/JPEG" is not a type this store issues keys for. …
      Tests  7 failed | 14 passed (21)
```
Reverted → `Test Files 1 passed (1) / Tests 21 passed (21)`, and the full suite back to `16 files / 161 tests`.

Every one of the 7 new tests is killed by the defect the critic found; none is assertion-free.

## 6. ANYTHING STILL OPEN

- **Client-side half of the seam is still Wave 1b.** `createMediaUploadUrl` is now the issuing function a
  surface must call; PEAK-222 (composer) is where a surface will call it. Nothing in this wave renders it, so
  the "no store call on refusal" guard is proven at the seam, not through a page.
- A surface could still call `getMediaStore().createUploadUrl(...)` directly and bypass the gate; that is now a
  detectable review issue rather than an absence (the gate has a real consumer and the bypass is greppable).
  Making the bypass structurally impossible (e.g. not exporting `getMediaStore` to surfaces) would change the
  bar's pinned `209-6` surface and is the orchestrator's/owner's call, not a fix-round edit.
- Minor observations the critic listed that are **not** this gap and were left untouched: `peak-fm.code-workspace`
  untracked (D1), `components/auth-form.tsx`'s generic refusal message, `lib/storage/local.ts`'s `upload()`
  seam reading of 209.A7, exiftool not installed (bar re-specified a synthesized fixture), and the
  `pnpm exec vitest run <path>` env-file quirk (used `pnpm test`'s invocation instead).
- Process note: the two kill-mutations were inline targeted edits applied and reverted inside this session
  (md5-verified), so no reusable script was created and nothing unregistered was left behind. The only
  scratch files are disposable `/tmp` copies made for the revert.

---

UNIT: PEAK-209 bar 209.A2 (issuing function calls validation first; store never asked on refusal)
FILES: `/home/bozertron/peak-fm/lib/storage/index.ts` (issuing function + import + header), `/home/bozertron/peak-fm/tests/storage/index.test.ts` (7 new tests), `/home/bozertron/peak-fm/build/WAVE1a-FIX-1-REPORT.md`
STATUS: done

> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-111] Execution wave plan and agent deployment specification

- Priority: P0
- Phase: 3-6
- Owner: Orchestrator
- Source: AREA-107 doctrine applied to the measured state of the tree
- Dependencies: AREA-107, AREA-109, AREA-110
- Risk: operations / context integrity
- Status: **PARTLY SUPERSEDED by AREA-112.** The PROHIBITED block has been supplied; a 10-vs-11 rule-count discrepancy still gates the first governed wave.

## SUPERSEDED IN PART — read AREA-112 first

Two things changed after this ticket was written.

1. **The PROHIBITED blocker (B0) is resolved.** The canonical block was supplied
   and is stored verbatim at `tickets/peak-rentals/doctrine/PROHIBITED.txt`.
   One discrepancy remains open: the doctrine calls it an 11-rule block and the
   supplied text contains **10** numbered rules plus an unnumbered `STAY SHORT`
   closer. Per STOP-SAFE, no eleventh rule has been invented and the closer has
   not been promoted. **This still gates the first governed wave.**

2. **The target changed to Tauri, native-first.** See AREA-112. Consequently:
   - **W1's `lib/data/*.ts` extraction step is WITHDRAWN.** It would relocate
     the hardcoded demo arrays rather than remove them, which violates rule 3.
     Local SQLite seeding replaces it (AREA-112 S4).
   - **The "maximum safe concurrency is 1" conclusion is relaxed.** It remains
     true for UI work, but AREA-112 adds a fully disjoint local-data-layer
     track that may run in parallel from day one.
   - The component-extraction half of W1, the file-ownership matrix, the W2
     builder roster, the prompt-assembly rules (P1) and the timeout classes all
     **still stand**, subject to the framework decision in AREA-112 D1.

Everything below is retained for the parts that still hold.

## B0 — The blocker, stated precisely

AREA-107 requires the full 11-rule PROHIBITED block pasted **verbatim** into
every agent prompt, and forbids paraphrasing or inventing a replacement. The
block is not in this repository, not in the supplied notes, and not in the
latest direction. Per STOP-SAFE, the orchestrator halts rather than composing a
substitute.

**Required to unblock:** the canonical block, verbatim, in full.
Nothing else in this ticket is blocked by anything else.

## S1 — The structural finding that reshapes every wave

**The anti-clobber doctrine cannot be applied to this tree as it stands.**

`app/page.tsx` is 80 lines that contain the *entire* application: all four
destinations (Communications, Discovery, Good People, GREAT Community), all
seventeen state hooks, all demo data arrays, and the invite modal. Measured
source surface is 188 lines across three files.

The doctrine says parallel agents touch only their own disjoint files, and that
shared files belong to the sequential registrar. On this tree **every UI ticket
touches the same single file**, so:

- Parallelism across AREA-101..105 is currently **impossible** — max safe
  concurrency is 1.
- `app/page.tsx` is by definition registrar-owned. There is no builder-owned
  surface for a builder to exist on.

Therefore Wave 1 is not a feature wave. It is a **decomposition wave** whose
only product is the disjoint file surface that every later parallel wave
requires. Attempting AREA-101..105 before it guarantees clobber.

## W1 — Wave 1: decomposition (sequential, single agent)

One agent, sequential, registrar class. No parallelism. No feature work, no
copy changes, no behavior changes — a pure, behavior-preserving extraction.

**Owns (exclusively):** `app/page.tsx`
**Creates (new files, no contention):**

| New file | Extracted from | Later owner |
|---|---|---|
| `lib/data/listings.ts` | `app/page.tsx:9-17` | shared, registrar |
| `lib/data/bulletin.ts` | `app/page.tsx:18-22` | shared, registrar |
| `lib/data/people.ts` | `app/page.tsx:23-28` | shared, registrar |
| `lib/data/places.ts` | `app/page.tsx:29` | shared, registrar |
| `components/peak/shell-state.tsx` | the 17 `useState` hooks + handoff logic | shared, registrar |
| `components/peak/communications.tsx` | `app/page.tsx:64-70` | AREA-101 / AREA-105 builder |
| `components/peak/discovery.tsx` | `app/page.tsx:72` | AREA-102 builder |
| `components/peak/good-people.tsx` | `app/page.tsx:74` | AREA-103 builder |
| `components/peak/community.tsx` | `app/page.tsx:76` | AREA-104 builder |
| `components/peak/invite-modal.tsx` | `app/page.tsx:78` | AREA-104 builder |
| `components/peak/avatar.tsx` | `app/page.tsx:32` | shared, registrar |

**SKIP guard:** if a target file already exists and exports the expected symbol,
skip it. Do not rebuild what works.

**Acceptance (all must hold):**
- `pnpm typecheck` exits 0.
- `pnpm build` exits 0 **with type checking enabled** (`ignoreBuildErrors` was
  removed this session — do not reinstate it).
- `GET /api/auth/ok` returns `{"ok":true}`.
- Rendered output is byte-identical for all four destinations. No copy changes
  in this wave — copy is AREA-101's job.
- No file outside the table above is modified.

**Explicitly deferred to later waves** (do NOT fix in Wave 1, only record):
the six mislabeled controls, the three state bugs, and the unused `authClient`
import — all catalogued in AREA-110. Fixing them here would make the extraction
non-behavior-preserving and destroy the diff's reviewability.

**Timeout class:** registrar, 900K.

## W2 — Wave 2: parallel builders (unblocked only after W1 lands)

Once W1 lands, these four become genuinely disjoint and may run in parallel:

| Agent | Owns exclusively | Ticket | Timeout |
|---|---|---|---|
| builder:communications | `components/peak/communications.tsx` | AREA-101, AREA-105 | 600K |
| builder:discovery | `components/peak/discovery.tsx` | AREA-102 | 600K |
| builder:good-people | `components/peak/good-people.tsx` | AREA-103 | 600K |
| builder:community | `components/peak/community.tsx` | AREA-104 | 600K |

**Anti-clobber invariant:** none of the four may touch `shell-state.tsx`,
`lib/data/*`, or `app/page.tsx`. Any change required there is returned to the
orchestrator as a registrar request, never applied by the builder.

Probe runs first (300K) to pin line anchors in the post-W1 files; probe output
is injected into each builder prompt as a context string. The registrar receives
truncated prior-builder output only where a shared-file change is genuinely
required.

Critic runs blind against the disk (900K), never sees builder reports,
kill-mutation enabled, capped at two fix rounds then halt for human review.
Agents never commit; the orchestrator verifies disk state and commits.

## P1 — Prompt assembly (binding on every agent in every wave)

`[identity, PROHIBITED, LIBRARIAN, RECIPE, STOPSAFE].join("\n")`

- `identity` — one file, one goal, named explicitly.
- `PROHIBITED` — the canonical 11 rules, **verbatim**. Blocked; see B0.
- `LIBRARIAN` — exact file paths and line-numbered integration points.
- `RECIPE` — RESEARCH → EXECUTE → TEST → RETURN → STOP.
- `STOPSAFE` — halt and ask on any ambiguity; never decide silently.

Deployment uses the three-argument helper `a(label, prompt, opts)` exclusively.
The four-argument arity bug silently swallows prompts and is prohibited.

## D1 — Decisions that must be ruled before W2 (not before W1)

W1 is copy-neutral, so it can proceed while these are open. W2 cannot.

1. **Discovery or Good Gear** as the nav label (AREA-108 open decision 1) —
   currently violated in code, see AREA-110.
2. **"Circle" or "circle"** — AREA-106 #3 and AREA-102 contradict each other.
3. Whether the map may be the dominant Discovery column.
4. Whether the seven priced items belong inside the map area or below it.
5. Ask AI: advisory only, or may it draft and send after confirmation?

## Acceptance criteria for this ticket

- The canonical PROHIBITED block is recorded in the repo and referenced by path.
- W1 completes with its acceptance list fully green and a reviewed disk diff.
- No two agents in any wave have modified the same file.
- The orchestrator, not any agent, authored every commit.

## Rollout and rollback

W1 is a pure refactor: revert is a single commit revert with no data or config
implications. W2 builders are individually revertible by file.

## Follow-through checkpoints

- Post-W1: typecheck, build, `/api/auth/ok`, four-destination visual diff.
- Pre-W2: confirm the five decisions above are ruled and recorded.
- Monitoring: file-ownership matrix re-verified against the diff at each wave close.
- Owner and escalation path: Orchestrator; ambiguity escalates to the user.

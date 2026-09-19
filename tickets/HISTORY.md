# History — what changed and why

**Date:** 2026-09-18 (records deleted 2026-09-19)
**Trigger:** Product direction change. Peak returns to its roots as a
**local-market cloud application** targeting Big White and the surrounding
Okanagan. The header now calls the tools and the intent of the target user
directly: Buy, Sell, Rent, Trade, Find, Plans, Communicate, Account.

The previous backlog (`AREA-101` .. `AREA-113`) and its five governing
documents have been **deleted** from the working tree. They described a stack
this repository does not use and a product direction that no longer applies,
and a rolling agent wave would have read them as instructions.

This file is the surviving record. It is deliberately self-contained: it
restates what those documents concluded rather than linking to them. The files
themselves remain recoverable in git history at commit `092b94e`.

---

## 1. What the pivot invalidates

### 1.1 The Tauri native-first architecture (AREA-112) — WITHDRAWN

AREA-112 made local-first Tauri on Fedora + Android the target and explicitly
deferred the server. The new direction is the opposite: **cloud-hosted web
first**, because beta testers must reach it from a URL.

This reverses AREA-112's four "incompatible surfaces" table entirely. Each row
was a problem *only* under static export; under a cloud deployment each is
simply the normal way to build the thing:

| Surface | AREA-112 verdict | Cloud verdict |
|---|---|---|
| `app/api/auth/[...all]/route.ts` | Cannot statically export | Correct and required |
| `app/admin/page.tsx` server session | Server-only, incompatible | Correct and required |
| `lib/db/index.ts` (`pg.Pool`) | Cannot run in a WebView | Correct and required |
| Better Auth server handler | Two problems | Correct and required |

**Consequence:** the SQLite retarget in AREA-112 S4 is withdrawn. The Drizzle
schema stays on `pg-core` and is now vastly extended — see
`docs/PEAK-DATA-MODEL.md`.

A native wrapper is not refused, only re-sequenced: it becomes a client of the
cloud API rather than the architecture. Recorded as a deferred decision in
`tickets/peak-cloud/OPEN-DECISIONS.md`.

### 1.2 The flavour vocabulary — RETIRED

Per explicit direction, the following names are retired from the product. They
appear in archived tickets and must not be reintroduced:

| Retired name | Replaced by |
|---|---|
| The Daily Yoddle | Communicate → Bulletin |
| The Mountain Horn | Communicate → Threads |
| Good Gear / Discovery | Buy (and Rent / Trade as siblings) |
| Good People | Account → Contacts, plus Communicate |
| The GREAT Community! / Lexicon | Plans → Community |
| peak → flow | Buy/Sell → Accounting Package export |

This **resolves the Discovery-vs-Good-Gear naming collision** that AREA-108
left open and AREA-110 section E re-raised. There is no collision because
neither name survives.

### 1.3 Trust-network-gated visibility — DEMOTED

The archived backlog made a vouch chain the gate on what a user could see
(`AREA-108`, and the whole trust-system phase of the old integration master).
A local-market app that has to attract downloads cannot hide its inventory
behind a social graph — the landing page has to *pitch*, which means showing
real supply to a signed-out visitor.

Trust is therefore demoted from an access-control mechanism to a **signal**:
reputation, verification badges, and per-listing blocking (`listing_block`,
which is what Trade's "remove visibility" compiles down to). The vouch graph
is not carried into the cloud schema.

---

## 2. What survives, and where it lives now

| Surviving artifact | Where it lives now | Status |
|---|---|---|
| `PROHIBITED.txt` (10 rules + STAY SHORT) | `tickets/doctrine/` | **Live, verbatim, unchanged** |
| Agent orchestration protocol (was AREA-107) | `tickets/doctrine/AREA-107-agent-orchestration-protocol.md` | **Live.** Governs the execution wave |
| Ticket template | `tickets/templates/` | Live |
| Self-hosted typography (was AREA-113) | Implemented in `app/globals.css` | **Shipped** |
| Sign-in 500 root cause (was AREA-109) | Restated in `PEAK-201` and `PEAK-250` | **Live as a requirement**, not as evidence |
| Preservation-first discipline | `tickets/peak-cloud/README.md` | Live, restated |

The AREA-109 reproduction scripts were deleted with the rest. They probed a
failure whose root cause is now fixed and permanently guarded by the stage-3
verification in `scripts/db-migrate.mjs`. The guard is the artifact worth
keeping; the probe was scaffolding.

### 2.1 The AREA-109 finding still binds

AREA-109 established that **no deploy step ever creates the database tables**,
and nothing detected it because nothing checked. That still holds, and it
matters more now that the target is a hosted URL with beta testers on it.

The cloud work addresses it directly: `scripts/db-migrate.mjs` now applies
domain migrations as well as the Better Auth schema, tracked in a
`_peak_migration` ledger table. See `PEAK-201`.

### 2.2 The AREA-110 state bugs are mooted, not fixed

AREA-110 catalogued six mislabeled controls and three state bugs in
`app/page.tsx`. That file — the entire 80-line single-page demo including its
hardcoded `listings`, `people`, and `bulletinPosts` arrays — is **replaced**,
not patched. The bugs leave with it. The rule-3 violation those arrays
represented is resolved by real tables and real queries, which is the fix
AREA-112 S4 was reaching for by a different route.

---

## 3. The open blocker, carried forward unresolved

**The PROHIBITED rule count.** The doctrine (AREA-107) calls for an **11-rule**
block pasted verbatim into every agent prompt. The canonical file at
`tickets/doctrine/PROHIBITED.txt` contains **10** numbered rules plus an
unnumbered `STAY SHORT` closer.

Per STOP-SAFE this was not resolved by invention, and it still is not. No
eleventh rule has been written. The closer has not been promoted to rule 11.

This is recorded as **D1** in `tickets/peak-cloud/OPEN-DECISIONS.md` and it
gates the first governed agent wave exactly as it did before.

---

## 3a. Deleted on 2026-09-19

A cleanup pass removed everything that could mislead an agent wave, plus the
code it left stranded:

| Deleted | Why |
|---|---|
| `docs/archive/` (5 documents) | Described Prisma, NextAuth and Stripe Connect — none of which exist here |
| `tickets/archive/peak-rentals/` (15 tickets) | Superseded; their conclusions are restated above |
| `tickets/evidence/` | Probes for a closed finding, now guarded by `pnpm db:check` |
| `components/ui/button.tsx`, `lib/utils.ts` | Orphaned; pure Tailwind, and Tailwind generated nothing |
| `components.json`, `postcss.config.mjs` | The shadcn/Tailwind config behind that orphan |
| `components/okanagan-map.tsx` | Demo code: hardcoded centre, one hardcoded marker, no props |
| 5 `public/placeholder-*` assets | v0 scaffolding, referenced nowhere |
| 13 npm packages | Transitively orphaned by the above — see `docs/PEAK-ARCHITECTURE.md` |

This closed **D2** (Tailwind/shadcn) as *remove*. Peak commits to the
hand-written CSS system documented in `docs/PEAK-DESIGN-SYSTEM.md`.

---

## 4. Decisions this pivot closed

These were open in the archived backlog and are now answered by direction:

| Old decision | Resolution |
|---|---|
| AREA-108 #1 — Discovery or Good Gear? | Moot. Both retired; the surface is **Buy** |
| AREA-112 D1 — Vite or Next static export? | Moot. **Next.js, server-rendered, cloud-hosted** |
| AREA-112 D2 — Offline map strategy | Moot for v1. Online tiles are acceptable in a cloud app |
| AREA-108 #5 — first release boundary for flow | Answered: the **Accounting Package** export is in scope for Buy and Sell |

Decisions that remain genuinely open were not silently closed. They are
restated in `tickets/peak-cloud/OPEN-DECISIONS.md`.

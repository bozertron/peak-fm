# Supersession Ledger — peak-rentals → peak-cloud

**Date:** 2026-09-18
**Trigger:** Product direction change. Peak returns to its roots as a
**local-market cloud application** targeting Big White and the surrounding
Okanagan. The header now calls the tools and the intent of the target user
directly: Buy, Sell, Rent, Trade, Find, Plans, Communicate, Account.

Every ticket under `archive/peak-rentals/` is superseded. This ledger records
what died, what survived, and where each surviving thing now lives. Nothing was
deleted.

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

| Surviving artifact | Old home | New home | Status |
|---|---|---|---|
| `PROHIBITED.txt` (10 rules + STAY SHORT) | `peak-rentals/doctrine/` | `tickets/doctrine/` | **Live, verbatim, unchanged** |
| Agent orchestration protocol | `peak-rentals/AREA-107...md` | `tickets/doctrine/AREA-107-agent-orchestration-protocol.md` | **Live.** Governs the cloud execution wave |
| Ticket template | `peak-rentals/templates/` | `tickets/templates/` | Live |
| Sign-in 500 reproduction scripts + logs | `peak-rentals/evidence/` | `tickets/evidence/` | **Live.** Still the auth health oracle |
| Self-hosted typography (AREA-113) | wave-3 | Already implemented in `app/globals.css` | **Shipped.** Kept as-is |
| Preservation-first discipline | README operating rules | `tickets/peak-cloud/README.md` | Live, restated |

### 2.1 The AREA-109 finding still binds

AREA-109 established that **no deploy step ever creates the database tables**,
and that `GET /api/auth/ok` is a zero-cost health oracle. Both still hold, and
both matter more now that the target is a hosted URL with beta testers on it.

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

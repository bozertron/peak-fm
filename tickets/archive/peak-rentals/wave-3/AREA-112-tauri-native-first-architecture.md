> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-112] Tauri native-first architecture

- Priority: P0
- Phase: 1 (supersedes the web-deployment assumptions in AREA-101..111)
- Owner: Orchestrator
- Source: User direction — Tauri app, native-first, all platforms
- Dependencies: AREA-110, AREA-111
- Risk: architecture / platform
- Status: Architecture agreed in principle. Two decisions open (D1, D2).

## Targets

- **Target 1 — Fedora Workstation (local).** Primary development and first ship.
- **Target 2 — Android.**
- Local-first. A discovery/sync server is required eventually so peers can find
  each other, but it is **explicitly out of scope** for Targets 1 and 2 and is
  tracked separately. Get the local app running first.

## S1 — What the pivot invalidates

The previous recommendation in this backlog — server components plus server
actions — is **withdrawn**. Tauri ships a static frontend bundle into a WebView.
There is no Node server at runtime.

**Evidence.** Setting `output: 'export'` and building produces:

    Error: Failed to collect page data for /api/auth/[...all]
    export const dynamic = "force-static" not configured on route
    "/api/auth/[...all]" with "output: export"

Four things are incompatible as currently written:

| Surface | Why it cannot ship to Tauri |
|---|---|
| `app/api/auth/[...all]/route.ts` | API routes cannot be statically exported. Confirmed build failure. |
| `app/admin/page.tsx` | Uses `headers()` and a server-side session lookup. Server-only. |
| `lib/db/index.ts` | `pg.Pool` is a Node TCP socket client. Cannot run in a WebView; least of all on Android. |
| Better Auth server handler | Mounted as a Next route handler against Postgres. Same two problems. |

None of this is a regression. None of it was reachable in production anyway
(see AREA-109) — the pivot simply makes that permanent and explicit.

## S2 — Offline is now a correctness requirement, not a nicety

`app/globals.css` previously loaded type via
`@import url('https://fonts.googleapis.com/...')`. In a native app that is a
network dependency on every cold start and unstyled text with no connection.
**Fixed** — see AREA-113; all faces are bundled.

The same lens must be applied to every remaining remote dependency. The known
one is the map: `components/okanagan-map.tsx` fetches OSM raster tiles from
`tile.openstreetmap.org`. On an offline-first Fedora/Android app this is the one
genuinely network-bound surface. Options, to be decided:

1. Bundle a clipped tile set for the Okanagan region (MBTiles / PMTiles).
2. Cache-on-first-use with an honest stale/offline indicator.
3. Render an explicit "map needs a connection" state.

Rule 1 forbids leaving this as a stub, and rule 2 forbids swallowing the tile
fetch error. Whichever option is chosen must be fully implemented.

## S3 — Orphans that the pivot gives a home (rule 9)

Rule 9 treats apparent dead symbols as unwired code. The pivot supplies the
missing connection for two of the three orphans catalogued in AREA-110:

| Orphan | Evidence it is unwired | Home the pivot gives it |
|---|---|---|
| `lib/db/schema.ts` (4 Drizzle tables) | No query imports them; only `pool` is imported, by `lib/auth.ts` | Drizzle has a SQLite driver. Repointed at on-device SQLite, this becomes the real local data layer. |
| `components/ui/button.tsx` | Imported nowhere in the tree | Base of the component system the decomposition wave needs. |
| `authClient` (`app/page.tsx:5`) | Imported, never called — exactly one occurrence | Becomes the local identity/session module (see S5). |

None of these may be deleted.

## S4 — Data layer

- **Store:** SQLite on device.
- **Access:** `tauri-plugin-sql`, with Drizzle's SQLite driver over it.
- **Schema:** derived from `lib/db/schema.ts`, retargeted from `pg-core` to
  `sqlite-core`. Timestamp handling changes; see the drift note in AREA-110.
- **Seed:** the demo content becomes real rows written on first run.

### This resolves the rule 3 conflict, and makes it cheaper
Rule 3 forbids "hardcoded fake data standing in for a feature". The seven
listings, four people and three bulletin posts in `app/page.tsx:9-29` are
exactly that. AREA-111's Wave 1 proposed extracting them to `lib/data/*.ts` —
which would only **relocate** the violation, not remove it.

Seeding them into local SQLite is different in kind: they become real rows,
read through the real query path, in the real store. That is sample content,
not a fake wired into a production path. With no server and no network, this is
also far cheaper than the equivalent web-stack approach, and it eliminates the
F6 failure class from AREA-109 outright — there is no deploy step and no remote
schema to drift.

## S5 — Identity

For Targets 1 and 2 the **device is the account**. No password auth, no session
cookies, no Better Auth server. Consequences:

- `/sign-in`, `/sign-up` and `/admin` leave the app for now.
- Their copy is not lost: the `.auth-brand` wordmark and `.auth-eyebrow`
  treatment are preserved in AREA-113, and AREA-110's D1 defect (the headline
  reading COMMERCE rather than Communications) still stands against whatever
  surface inherits it.
- Real multi-party auth returns with the discovery/sync server, where it
  belongs, and the four Better Auth tables are retained for that purpose.

## D1 — OPEN: Vite or Next static export?

Next in `output: 'export'` mode contributes file-based routing and little else —
every feature justifying Next is a server feature that is unavailable here,
while the build weight and static-export edge cases remain. Vite + React is the
conventional Tauri pairing: faster HMR, smaller output, no export quirks.

**Recommendation: switch to Vite, and do it now.** The app is 188 lines of
source; the migration is close to free today and becomes steadily more
expensive. Next static export remains workable if preferred.

*Blocking: the decomposition wave's target layout depends on this answer.*

## D2 — OPEN: offline map strategy
See S2. Decide between bundled tiles, cache-with-fallback, or an explicit
offline state.

## S6 — Android specifics (Target 2)

- Tauri v2 Android requires the Android SDK and NDK in the build environment;
  this container cannot necessarily produce an APK, but the project can be
  scaffolded and Fedora-verified first.
- Touch target sizing, safe-area insets, and hardware back-button handling are
  UX work that does not exist in the current tree.
- Bundle size matters: the single variable font file (AREA-113) was chosen
  partly for this.

## S7 — Revised wave shape (amends AREA-111)

AREA-111 concluded that maximum safe concurrency was 1, because every UI ticket
touched `app/page.tsx`. That holds for UI work, but the pivot adds a second,
**fully disjoint** track:

| Track | Owns | Collides with UI track? |
|---|---|---|
| A — local data layer | `lib/db/schema.ts` (retargeted), SQLite setup, seed, query modules | No — all greenfield or unwired files |
| B — UI decomposition | `app/page.tsx` → per-destination components | No |

These two may run in parallel from day one under the anti-clobber rule. Track A
replaces AREA-111's `lib/data/*.ts` extraction step, which is withdrawn as a
rule 3 violation.

## Acceptance criteria

- `pnpm build` (or the Vite equivalent) produces a fully static bundle with no
  server-rendered routes.
- The app launches in Tauri on Fedora Workstation and reaches the Communications
  destination with **no network connection available**.
- Listings, people and bulletin content are read from on-device SQLite, not from
  literals in component source.
- No remaining runtime fetch to any remote host except the map, whose behavior
  is whatever D2 decides — implemented, not stubbed.
- The three orphans in S3 are wired, not deleted.

## Rollout and rollback

Track A is additive. Track B is a behavior-preserving refactor, revertible per
file. The framework decision in D1 is the only irreversible step; take it before
either track starts.

## Follow-through checkpoints

- Post-decision: record D1 and D2 with rationale.
- Post-Track-A: seeded database verified by query, not by UI inspection.
- Post-Track-B: four destinations render identically to the pre-refactor build.
- Airplane-mode test on both targets before either is called done.
- Owner and escalation path: Orchestrator; ambiguity escalates to the user.

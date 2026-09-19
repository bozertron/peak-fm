# [PEAK-200] Domain schema

|  |  |
|---|---|
| **Wave** | — |
| **Status** | **DONE — verified** |
| **Area** | Foundation |
| **Depends on** | none |
| **Blocks** | everything |
| **Blocked by decision** | — |
| **Files you own** | `lib/db/schema/**` except registrar-owned `lib/db/schema/index.ts` |
| **Risk** | data |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Give every surface in `docs/PEAK-PRODUCT-SPEC.md` a real table to read and write,
replacing the hardcoded demo arrays that were the app's only data.

## Delivered
34 Peak tables across 10 files in `lib/db/schema/`, plus a mirror of Better
Auth's 4. One file per bounded area so parallel agents own disjoint files —
the anti-clobber rule could not be applied while the whole app was one module.

Invariants encoded structurally, not by comment:
- `find_request` has **no** conversion column — a Find ends as a Find.
- Archive/delete live on `thread_participant`, never on `thread`.
- `trade_offer.parentOfferId` makes counters a chain, not an overwrite.
- `roi_model.listingId` is null until export — the model precedes the listing.
- `autopay_contract` needs both acceptance timestamps before `active`.

## Verification evidence
```
$ pnpm db:migrate
==> Verifying schema against lib/db/schema/
    38/38 table(s) verified
Schema is consistent.
$ pnpm typecheck   # clean
```

## Rollback
`drizzle/0000_peak_cloud_domain.sql` is additive — it creates tables and touches
no existing data. Rollback is dropping the new tables.

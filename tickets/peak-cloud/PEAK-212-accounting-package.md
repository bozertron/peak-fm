# [PEAK-212] Accounting Package export

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN — **tax fields blocked by D5** |
| **Area** | Buy / Sell |
| **Depends on** | PEAK-230, PEAK-232 |
| **Blocks** | PEAK-310 |
| **Blocked by decision** | **D5** (tax treatment only) |
| **Files you own** | `lib/accounting/**` |
| **Risk** | legal / data |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"When the buyer finishes the purchase, they can go into their Buy History panel
and Download Accounting Package" — and the same, contextualised, for sales.

## Scope
Generate one `accounting_record` per `(order, perspective)`, freeze it, and
export. Required fields:

| Field | Column |
|---|---|
| Description of item | `itemDescription` |
| Its purpose | `itemPurpose` |
| Cost | `costCents` |
| Tax allocation(s) | `taxAllocations` |
| Account from → to | `accountFrom` / `accountTo` — only if the user opted in |
| Research-validated tax relief / write-off potential | `taxTreatment`, `reliefNotes`, `researchSources`, `confidence` |

Export formats: CSV and PDF. Bulk export for a date range, since the actual use
is quarterly filing, not one purchase at a time.

## The hard constraint
> `reliefNotes` may **never** be populated with an empty `researchSources`, and
> `confidence` must always be explicitly set.

A package that cannot cite a source says so on its face. This is research
output presented as research. It is never advice, and Peak never asserts a
write-off it cannot back. Every generated package carries this statement.

Default `confidence` is `unsupported`. That is the honest default, not a stub.

## Blocked
**D5** — whether Peak calculates, collects, or only records GST/PST. Build the
record, the freeze, and both export formats now; do not invent the tax rules.
Halt and ask when you reach them.

## Acceptance criteria
- Given a completed order, when the buyer exports, then the package contains
  every field above with the buyer's perspective.
- Given the same order, when the seller exports, then it is contextualised for
  a sale.
- Given `reliefNotes` set with no sources, then generation **fails** — enforce in
  code and with a database CHECK constraint.
- Given a frozen package, when the order is later edited, then the package does
  not change.

## Verification evidence
Golden-file tests for CSV and PDF. A test proving the empty-sources case fails.

## Rollback
Behind `accounting.package`.

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint         # once PEAK-207 lands
pnpm typecheck
pnpm build
pnpm test         # once PEAK-206 lands
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

Plus this ticket's own **Verification evidence** above.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If it links to a route that
does not exist yet, add the line with your ticket number. That list may only
shrink.

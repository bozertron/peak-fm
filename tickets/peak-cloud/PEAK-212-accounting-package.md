# [PEAK-212] Accounting Package export

- Priority: P1 · Area: Buy / Sell · Status: OPEN — **partly blocked by D5**
- Dependencies: PEAK-230, PEAK-232
- Risk: legal / data

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

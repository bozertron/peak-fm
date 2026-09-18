# [PEAK-310] Account: Buy & Sell History

- Priority: P1 · Area: Account · Status: OPEN
- Dependencies: PEAK-232, PEAK-212
- Risk: UX

## Intent
The panel the accounting package is downloaded from, for both perspectives.

## Scope
`/account/history` with a `perspective` switch (buyer / seller). Filter by date
range, status and listing kind. Per row: the order, its thread, its listing, and
a package download. A bulk export for a date range — the real use is quarterly
filing, not one purchase at a time. Rental agreements and their auto-pay
collection history appear here too.

## Acceptance criteria
- Given a user who has both bought and sold, then each perspective shows only
  the relevant orders.
- Given a date range, then bulk export contains exactly the orders in range.
- Given another user's order id, when requested directly, then it is refused.

## Verification evidence
An authorization test for the direct-id case. A bulk export golden file.

## Rollback
Behind `accounting.package` for export; the history list itself can ship without it.

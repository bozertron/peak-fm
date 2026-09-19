# [PEAK-310] Account: Buy & Sell History

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Account |
| **Depends on** | PEAK-232, PEAK-212 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/account/history/**` |
| **Risk** | UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

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

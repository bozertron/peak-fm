# [PEAK-242] In-app beta feedback widget

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Admin |
| **Depends on** | PEAK-203 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `components/feedback/**` |
| **Risk** | low |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Testers report where they are confused at the moment they are confused, not
three days later in a message.

## Scope
A persistent control on every surface, open to signed-in users. Kind: bug,
confusion, idea, praise. Captures `surface`, and automatically the route,
viewport and user agent into `context` — a bug report without the route is
usually unusable. Appears immediately in the admin dashboard.

## Acceptance criteria
- Given a submission from `/buy?category=tools-equipment`, then `context`
  records the full route including the query.
- Given a signed-out visitor, then the widget is absent (or anonymous — decide
  and state it in the ticket).
- Given a submission, then it appears in the admin feedback table without a
  deploy.

## Verification evidence
One submission from each surface, with the stored `context` pasted.

## Rollback
Remove the widget; the table and admin view are unaffected.

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

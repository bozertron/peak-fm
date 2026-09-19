# [PEAK-###] Ticket title

|  |  |
|---|---|
| **Wave** | 0 / 1 / 2 / 3 |
| **Status** | OPEN / BLOCKED / DONE — verified |
| **Area** | Foundation / Platform / Buy / Sell / Rent / Trade / Find / Plans / Communicate / Account / Admin / Commerce |
| **Depends on** | ticket ids, or `none` |
| **Blocks** | ticket ids, or `nothing` |
| **Blocked by decision** | D-id, or `—` |
| **Files you own** | explicit globs — this is the anti-clobber contract |
| **Risk** | security / data / money / UX / operations |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar. Surface-specific CSS goes in your surface's own
> stylesheet, never in `globals.css`.

## Intent

What this exists to do, in the product's own words where possible. Quote
`docs/PEAK-PRODUCT-SPEC.md` rather than paraphrasing it.

## Scope

What is in. Be explicit about what is **not** in, and name the ticket that owns
it instead — an unowned assumption is how PEAK-209 and PEAK-213 went missing.

## Acceptance criteria

Given / when / then. Include authorization and privacy behaviour explicitly:
a Server Function is reachable by direct POST, so "the page checks it" is not
an acceptance criterion.

## Verification evidence

Name the specific evidence. "Tests pass" is not evidence; the pasted output of
a named test is.

## Rollback

Which feature flag turns this off, or why no rollback is needed.

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm db:check
pnpm check:links
```

Plus this ticket's own Verification evidence.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.**

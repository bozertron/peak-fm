# [PEAK-240] Beta invite redemption

|  |  |
|---|---|
| **Wave** | **1** |
| **Status** | OPEN |
| **Area** | Admin |
| **Depends on** | PEAK-203, PEAK-204 |
| **Blocks** | first external tester |
| **Blocked by decision** | — |
| **Files you own** | `app/sign-up/**`, `lib/invites.ts` |
| **Risk** | security |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
`beta.invite_only` is seeded **enabled** and the admin can already create and
revoke codes — but **nothing enforces it at sign-up**. Right now anyone who
reaches the URL can register.

This is a real gap, stated plainly rather than left implied by a flag that
looks like it works.

## Scope
- An invite code field on sign-up, shown when `beta.invite_only` is on.
- Validate: exists, not revoked, not expired, `redemptionCount < maxRedemptions`.
  If the invite names an email, it must match.
- On success increment `redemptionCount`, set `redeemedById` and `redeemedAt`,
  and write `admin_audit_log`.
- Race safety: two people redeeming the last use of one code concurrently must
  not both succeed. Use a conditional update and check the affected row count.

## Acceptance criteria
- Given `beta.invite_only` on and no code, then sign-up is refused.
- Given a revoked or expired code, then refused with a distinguishable reason.
- Given concurrent redemption of the final use, then exactly one succeeds.
- Given the flag off, then sign-up proceeds without a code.

## Verification evidence
A concurrency test for the final-use case — paste the actual output, since this
is the one that fails quietly in production.

## Rollback
Turn `beta.invite_only` off in the admin dashboard.

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

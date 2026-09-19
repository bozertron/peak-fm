# [PEAK-241] Feature flag rollout evaluation

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Admin |
| **Depends on** | PEAK-203 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `lib/queries/market.ts` (flag evaluation only), `app/admin/page.tsx` (rollout controls only), `app/admin/actions.ts` (rollout mutation and audit only) |
| **Risk** | operations |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
`feature_flag.rollout` (jsonb) exists and is documented as
`{ marketIds?, userIds?, percentage? }`, but **only the boolean is evaluated**.
The column is real; the logic is not written yet.

## Scope
Extend `isEnabled()` in `lib/queries/market.ts` to a full evaluation taking the
viewer and market into account, with a deterministic percentage bucket (hash of
flag key + user id) so a user does not flip between buckets on reload. Admin UI
to edit the rollout. Audit every change.

## Rules
1. `enabled: false` is an absolute off — rollout never overrides it.
2. Unknown keys remain OFF.
3. Bucketing is deterministic and stable per (flag, user).

## Acceptance criteria
- Given `percentage: 50`, then the same user always lands in the same bucket.
- Given `marketIds`, then a user outside those markets does not get the surface.
- Given `enabled: false` with a rollout set, then everyone is off.

## Verification evidence
Bucket-stability test over repeated evaluations. Paste the run.

## Rollback
Fall back to boolean evaluation.

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

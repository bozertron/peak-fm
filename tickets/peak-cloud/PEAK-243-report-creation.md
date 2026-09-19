# [PEAK-243] Member-side reporting

|  |  |
|---|---|
| **Wave** | **3** (registrar placement pass) |
| **Status** | OPEN |
| **Area** | Admin |
| **Depends on** | PEAK-203 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `components/report/**` |
| **Risk** | abuse / trust |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
A marketplace with strangers transacting needs a report path before external
testers arrive, not after the first incident.

## Placement is a registrar pass

Like PEAK-280, this control belongs on six surfaces owned by other agents.
Build the mechanism in files this ticket owns, then place it in **one registrar
commit**. Six agents each adding a report button is a guaranteed clobber.

## Scope
A report control on listings, messages, users, plans, finds and bulletin posts,
writing `moderation_report`. Structured reasons plus free text. The reporter
sees that it was received; they do **not** see the outcome by default (that is a
policy question — if unclear, raise a decision rather than choosing).

Rate-limit per reporter to prevent report spam being its own abuse vector.

## Acceptance criteria
- Given a report on each entity type, then `entityType` and `entityId` resolve
  to the real object in the admin queue.
- Given repeated reports from one user, then rate limiting applies.
- Given a resolved report, then the audit log records who resolved it and how.

## Verification evidence
One report per entity type, resolved from the admin dashboard, with the audit
rows pasted.

## Rollback
Remove the control; the queue is unaffected.

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

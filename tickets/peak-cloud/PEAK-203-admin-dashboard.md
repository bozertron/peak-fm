# [PEAK-203] Admin dashboard for beta operations

|  |  |
|---|---|
| **Wave** | — |
| **Status** | **DONE — verified** |
| **Area** | Admin |
| **Depends on** | PEAK-200, PEAK-204 |
| **Blocks** | PEAK-240 … PEAK-243 |
| **Blocked by decision** | — |
| **Files you own** | `app/admin/**`, `lib/queries/admin.ts` |
| **Risk** | security / operations |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
The product goes to beta testers on a URL. Give the operator a way to see what
is happening and to switch things off without a deploy.

## Delivered
`/admin` with nine sections — key numbers, markets, feature flags, beta invites,
members, supply by surface, moderation queue, beta feedback, audit log. Every
number is a live count.

Six safety rules, implemented and tested:
1. The last admin cannot be demoted.
2. You cannot remove your own admin role.
3. Every privileged mutation writes `admin_audit_log`, with the actor's email
   denormalised so the trail survives the actor being deleted.
4. Invite codes avoid I, O, 0, 1 — they get read aloud and typed by hand.
5. A redeemed invite cannot be revoked.
6. Unknown feature flags read as OFF.

Authorization is re-checked **inside every Server Function**, not only in the
page, because Server Functions are reachable by direct POST.

## Verification evidence
Browser test against a real database: member → 307, admin → 200; toggling
`surface.buy` flipped the control to On and removed the closed notice from
`/buy` with no deploy; invite code matched `/^[A-Z2-9]{8}$/`; both actions
appeared in the audit log after reload.

## Not included — tracked separately
PEAK-240 invite redemption · PEAK-241 rollout evaluation · PEAK-242 feedback
widget · PEAK-243 report creation. The admin can read and resolve; the
member-side paths that fill those tables do not exist yet.

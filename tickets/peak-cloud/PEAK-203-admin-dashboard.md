# [PEAK-203] Admin dashboard for beta operations

- Priority: P0 · Area: Admin · Status: **DONE — verified**
- Dependencies: PEAK-200, PEAK-204
- Risk: security / operations

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

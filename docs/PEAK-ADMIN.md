# Peak — Admin Dashboard

**Status:** Implemented and verified. **Last updated:** 2026-09-18
**Route:** `/admin` — outside the `(app)` group, own chrome, no member nav.

## Why it exists

The product is about to be handed to beta testers on a URL. Everything here
serves that: who is in, what they did, what broke, and what can be turned off
without a deploy.

## Access

`role === 'admin'`, checked in the page **and** independently inside every admin
Server Function, because Server Functions are reachable by direct POST.

Verified end to end: a `member` receives `307 → /`; an `admin` receives `200`.

Roles are not self-assignable — `role` is declared `input: false` in
`lib/auth.ts`, so the sign-up form cannot set it.

## Sections

| Section | What it shows | Actions |
|---|---|---|
| Key numbers | members, live listings, paid orders + gross, open finds, threads + messages, open reports | — |
| Markets | every market, region, radius, open/closed | open / close a market |
| Feature flags | 12 kill switches with descriptions | toggle on / off |
| Beta invites | code, recipient, uses, state | create, revoke |
| Members | name, email, market, joined, role | change role |
| Supply by surface | listings grouped by kind × status | — |
| Moderation queue | open reports with entity and reason | action / dismiss with a note |
| Beta feedback | in-app tester feedback by surface and kind | — |
| Audit log | last 40 privileged actions | — |

Every number is a **live count**. Nothing on the page is cached or estimated.

## Safety rules, implemented

1. **The last admin cannot be demoted.** Checked before the write; returns an
   error naming the reason. Prevents locking everyone out of `/admin`.
2. **You cannot remove your own admin role.** Separate check, clearer message.
3. **Every privileged mutation writes `admin_audit_log`** — actor id *and*
   denormalised actor email, so the trail survives the actor being deleted.
   Append-only; never updated, never deleted.
4. **Invite codes avoid I, O, 0 and 1.** They get read aloud and typed by hand.
   8 characters from a 32-symbol alphabet, `crypto.getRandomValues`.
5. **A redeemed invite cannot be revoked.** Revoking history is a lie.
6. **Unknown feature flags read as OFF.** A flag that was never seeded must not
   open a half-built surface.

## Feature flags

Seeded by `pnpm db:seed`. All surfaces ship **disabled**; `beta.invite_only`
ships **enabled**.

```
surface.buy          surface.sell         surface.rent
surface.trade        surface.find         surface.plans
surface.communicate  commerce.checkout    commerce.autopay
accounting.package   llm.widget_creator   beta.invite_only
```

A disabled surface still renders its real data to an admin, with a notice
saying the operator has it switched off. It is a real state with a real cause,
not a placeholder.

`rollout` (`jsonb`) is present on `feature_flag` for per-market, per-user and
percentage rollout. The column exists; the evaluation logic beyond the boolean
is **PEAK-241** and is not yet written.

## Verified behaviour

Exercised in a real browser against a real database:

- member → `/admin` redirects; admin → `/admin` renders
- toggling `surface.buy` on flips the control to **On** and removes the closed
  notice from `/buy` — **without a deploy**
- creating an invite returns a code matching `/^[A-Z2-9]{8}$/`
- both actions appear in the audit log after reload

## Not yet built

Tracked as tickets, not implied as working:

- **PEAK-240** — invite redemption at sign-up (`beta.invite_only` is enforced
  nowhere yet; the flag and the table exist, the gate does not)
- **PEAK-241** — flag rollout evaluation beyond the boolean
- **PEAK-242** — in-app feedback widget writing `beta_feedback`
- **PEAK-243** — report creation UI writing `moderation_report`

The admin can already read and resolve both tables; what is missing is the
member-side path that fills them.

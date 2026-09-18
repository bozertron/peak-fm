# [PEAK-240] Beta invite redemption

- Priority: P0 · Area: Admin · Status: OPEN
- Dependencies: PEAK-203
- Risk: security
- **Needed before the first external tester.**

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

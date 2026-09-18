# [PEAK-241] Feature flag rollout evaluation

- Priority: P2 · Area: Admin · Status: OPEN
- Dependencies: PEAK-203
- Risk: operations

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

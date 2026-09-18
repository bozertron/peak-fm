# peak-cloud — Status Board

**Updated:** 2026-09-18

## Done and verified

| Ticket | Area | Evidence |
|---|---|---|
| PEAK-200 | Domain schema | 38/38 tables verified |
| PEAK-201 | Migration runner + verification | fresh + repeat run, both clean |
| PEAK-202 | Eight-surface app shell | 12 routes 200, browser test passing |
| PEAK-203 | Admin dashboard | member 307 / admin 200, flag toggle + audit verified |
| PEAK-204 | Auth: roles and trusted origins | two live defects reproduced and fixed |

## Open, in dependency order

### Wave 1 — unblock everything else
| Ticket | Why first |
|---|---|
| **PEAK-300** Threads | Blocks 211, 232, 270, 290. Six tickets wait on it |
| **PEAK-220** Presentation builder | Nothing can be bought until something can be sold |
| **PEAK-230** Provider seam | Blocks all commerce |
| **PEAK-240** Invite redemption | `beta.invite_only` is enforced nowhere. Needed before the first external tester |
| **PEAK-250** Deploy pipeline | Closes AREA-109 for good *(blocked by D3)* |

### Wave 2 — the surfaces
| Ticket | Area | Blocked by |
|---|---|---|
| PEAK-210 Buy browse and filters | Buy | needs 220 for real supply |
| PEAK-221 Product Widget Creator | Sell | **D6** for the LLM path; manual path is not blocked |
| PEAK-231 Stripe Connect | Commerce | **D4** |
| PEAK-260 Build Rental | Rent | 220 |
| PEAK-261 Explore ROI | Rent | — |
| PEAK-270 Trade offers and Bid as Sale | Trade | 220, 300 |
| PEAK-280 Find capture | Find | — |
| PEAK-242 Beta feedback widget | Admin | — *(cheap, high value)* |
| PEAK-243 Member-side reporting | Admin | — |

### Wave 3
| Ticket | Area | Blocked by |
|---|---|---|
| PEAK-211 Buyer question sets | Buy | 300 |
| PEAK-232 In-chat checkout | Commerce | 231, 300 |
| PEAK-212 Accounting Package | Buy/Sell | 230, 232, **D5** for tax |
| PEAK-262 Auto-pay contracts | Rent | 231 |
| PEAK-281 Find matchmaking | Find | 280, 210 |
| PEAK-290 Plans | Plans | 280, 300 |
| PEAK-291 Community board | Plans | — |
| PEAK-310 Buy & Sell History | Account | 232, 212 |
| PEAK-241 Flag rollout evaluation | Admin | — |

## Blocked on a decision, not on work

| Decision | Blocks |
|---|---|
| **D1** PROHIBITED rule count | the first governed agent wave — *everything* |
| **D2** Tailwind / shadcn | any new shadcn component |
| **D3** Hosting target | PEAK-250 |
| **D4** Payment account model | PEAK-231 |
| **D5** BC tax scope | the tax fields of PEAK-212 |
| **D6** LLM provider | the LLM path of PEAK-221 |

See `OPEN-DECISIONS.md`. **Do not guess these in code.**

## Honest gaps in what is already shipped

Stated so nothing looks more finished than it is:

- `beta.invite_only` is seeded **on** but enforced **nowhere** (PEAK-240).
- `feature_flag.rollout` exists as a column; only the boolean is evaluated
  (PEAK-241).
- `beta_feedback` and `moderation_report` are readable and resolvable in admin,
  but **nothing creates rows** (PEAK-242, PEAK-243).
- No listing can be created through the UI yet (PEAK-220). Every surface
  therefore renders an honest empty state.
- `components/ui/button.tsx` is orphaned and would render unstyled — **D2**.

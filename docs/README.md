# Peak — Documentation

Peak is a **local-market cloud application**. First market: **Big White, BC**.

```
peak   Buy   Sell   Rent   Trade   Find   Plans   Communicate        [Account]
```

## Read in this order

| # | Document | What it settles |
|---|---|---|
| 1 | [PEAK-PRODUCT-SPEC.md](PEAK-PRODUCT-SPEC.md) | What each of the seven surfaces is and why. **Start here.** |
| 2 | [PEAK-ARCHITECTURE.md](PEAK-ARCHITECTURE.md) | The real stack, the route map, auth, migrations, two fixed bugs |
| 3 | [PEAK-DATA-MODEL.md](PEAK-DATA-MODEL.md) | 38 tables, conventions, and the invariants encoded in them |
| 4 | [PEAK-COMMERCE.md](PEAK-COMMERCE.md) | The payment provider seam and Stripe Connect mapping |
| 5 | [PEAK-ADMIN.md](PEAK-ADMIN.md) | The beta operations dashboard |
| 6 | [PEAK-DESIGN-SYSTEM.md](PEAK-DESIGN-SYSTEM.md) | Tokens, patterns, the account graphic, accessibility |

Then the live backlog: [`../tickets/peak-cloud/`](../tickets/peak-cloud/) — and
before writing a line of code, [`../tickets/doctrine/PROHIBITED.txt`](../tickets/doctrine/PROHIBITED.txt).

## History

The five documents from the previous product direction were **deleted** on
2026-09-19. They described Prisma, NextAuth and Stripe Connect — none of which
exist in this repository — and an agent wave would have read them as
instructions.

What they concluded, and what carried forward, is recorded self-contained in
[`../tickets/HISTORY.md`](../tickets/HISTORY.md). The files themselves remain
in git history at commit `092b94e`.

**Everything in `docs/` is current.** If a document here disagrees with the
code, the code is right and the document is a bug — say so.

## Running it

```bash
./scripts/dev-setup.sh     # deps, postgres, .env.local, schema
pnpm db:seed               # markets, categories, feature flags
pnpm dev                   # http://localhost:3000
```

Then make yourself an admin:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

and open `/admin` to switch surfaces on.

## Ground rules

1. **No stubs.** `tickets/doctrine/PROHIBITED.txt` is 11 numbered rules and it
   is binding. Rule 11 is `NO GREP-ABSENCE = INTENT-ABSENCE`: an unreferenced
   symbol, reserved asset or computed-but-unrendered field is a specification,
   not dead weight.
2. **An honest empty state beats fake data.** No sample listings are seeded, on
   purpose.
3. **`pnpm db:check` is a predeploy gate.** A production sign-in once 500'd
   because no deploy step created the tables and nothing checked.
4. **Open decisions are not guessed in code.** They live in
   `tickets/peak-cloud/OPEN-DECISIONS.md`. Stop and ask.

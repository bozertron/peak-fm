import type { Config } from 'drizzle-kit'

/**
 * Domain migrations are GENERATED from `lib/db/schema/`, never hand-written.
 *
 * The Better Auth tables (`user`, `session`, `account`, `verification`) are
 * mirrored in the schema so the rest of the model can reference `user.id`, but
 * they are CREATED by Better Auth's own planner in `scripts/db-migrate.mjs`,
 * which runs first. Drizzle's generated SQL is applied after, and the runner
 * makes every statement idempotent so the overlap is harmless.
 */
export default {
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  // The auth tables have an external owner; never plan drops against them.
  // Better Auth's planner owns these four and runs first; Drizzle only
  // references them. Keeping them in the TS schema is what gives the rest of
  // the model real foreign keys against `user.id`.
  tablesFilter: ['*', '!user', '!session', '!account', '!verification'],
} satisfies Config

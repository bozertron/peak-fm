// Runs as a vitest `setupFiles` module: BEFORE the test file's module graph is
// loaded, and therefore before `lib/db/index.ts` evaluates
// `new Pool({ connectionString: process.env.DATABASE_URL })` at module load.
// So DATABASE_URL must be assigned here and nowhere else — and a missing value
// must throw, because falling back would point the app pool at the developer's
// working database.
const scratchSchema = process.env.PEAK_TEST_SCHEMA
const scratchUrl = process.env.PEAK_TEST_DATABASE_URL

if (!scratchSchema || !scratchUrl) {
  throw new Error(
    'Test database environment is not initialised: PEAK_TEST_SCHEMA and ' +
      'PEAK_TEST_DATABASE_URL must both be set by the vitest globalSetup before ' +
      'any test imports application code. Run the suite through `pnpm test` ' +
      '(which runs the globalSetup that creates the scratch schema). If the ' +
      'database is not up, run ./scripts/dev-setup.sh first. Refusing to fall ' +
      'back to the developer database.',
  )
}

// better-auth signs sessions with this secret; tests must never invent one.
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    'BETTER_AUTH_SECRET is not set. Run ./scripts/dev-setup.sh to create ' +
      '.env.local with a generated dev secret. Refusing to invent a secret.',
  )
}

process.env.DATABASE_URL = scratchUrl

// Re-assert: if the assignment above were ever a no-op the app pool would
// silently connect to the working database. Fail now, not after a query.
if (process.env.DATABASE_URL !== process.env.PEAK_TEST_DATABASE_URL) {
  throw new Error(
    'Failed to point DATABASE_URL at the scratch schema: assign did not take ' +
      `effect (expected ${process.env.PEAK_TEST_DATABASE_URL}, got ${process.env.DATABASE_URL}).`,
  )
}

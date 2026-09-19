/**
 * Database primitives for the test suite: the scratch schema's pool, a table
 * row counter, and the between-tests reset.
 *
 * WHERE THE CONNECTION COMES FROM
 * `tests/setup/global-db.ts` (vitest `globalSetup`) creates a per-process
 * scratch schema (`peak_test_<pid>`), migrates it with the real runner, and
 * exports `PEAK_TEST_SCHEMA` / `PEAK_TEST_DATABASE_URL` / `DATABASE_URL` into
 * `process.env`. `tests/setup/db-env.ts` (vitest `setupFiles`) re-asserts that
 * `DATABASE_URL` points at the scratch schema before any application module
 * loads. This file reads that same `process.env.DATABASE_URL`, lazily, once per
 * call site — and refuses to fall back, because the fallback would be the
 * developer's working database.
 *
 * WHAT "RESET" MEANS
 * `resetTestDatabase()` truncates every base table in the expected scratch schema in ONE
 * statement so a test starts from an empty fixture without paying for a
 * re-migration. The tables are discovered, not hardcoded: the fixture is
 * whatever `scripts/db-migrate.mjs` produced, and a hand-written list would be
 * a second source of truth that drifts from `lib/db/schema/`.
 */

import { Pool } from 'pg'

/**
 * The migration journals. TRUNCATING EITHER ONE CORRUPTS THE FIXTURE:
 * `scripts/db-migrate.mjs` records applied files in `_peak_migration` and skips
 * the ones it finds there — an empty journal makes the next migration replay
 * every statement against tables that already exist. `__drizzle_migrations` is
 * drizzle-kit's journal; this repo drives the migration itself rather than
 * through drizzle-kit's migrator, so it is listed for completeness (and
 * `tests/setup/global-db.ts` treats the two the same way when it counts the
 * scratch schema's application tables). Neither is application data, so neither
 * belongs in a reset.
 */
const MIGRATION_JOURNAL_TABLES = new Set(['__drizzle_migrations', '_peak_migration'])

/**
 * One pool per process. The contract calls this a cached promise; it is the
 * same `Pool` object every call returns until `closeTestPool()` clears it.
 */
let cachedPool: Pool | null = null

/**
 * The scratch-schema pool. Created on first use so that importing this module
 * never opens a connection (and never reads `DATABASE_URL` before the
 * globalSetup has pointed it somewhere safe).
 */
export function testPool(): Pool {
  if (cachedPool) return cachedPool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set, so there is no scratch schema to connect to. ' +
        'Run the test suite through `pnpm test`: its vitest globalSetup ' +
        '(tests/setup/global-db.ts) creates and migrates a scratch schema and ' +
        'exports the connection string. Refusing to fall back to a real ' +
        'database.',
    )
  }

  cachedPool = new Pool({ connectionString })
  return cachedPool
}

/**
 * Quote a Postgres identifier so reserved words (`user`, `order`, `session`,
 * `plan`, `market`, `message`, `find_request` …) and mixed case survive
 * interpolation into DDL/DML. Identifiers cannot be parameterised, so quoting is
 * the only defence — and it is the caller's identifier, never user input.
 *
 * Exported because `tests/setup/global-db.ts` needs the same quoting when it
 * re-points the scratch schema's foreign keys: identifiers cannot be
 * parameterised, so one implementation of "quote it safely" is the only way two
 * DDL writers cannot disagree about what safe means.
 */
export function quoteIdentifier(name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(
      `Refusing to quote an empty identifier (got ${typeof name}). Pass a real ` +
        'table, column or constraint name — e.g. countRows("user").',
    )
  }
  if (name.includes('\u0000')) {
    throw new Error('Refusing to quote an identifier containing a NUL byte.')
  }
  return `"${name.replaceAll('"', '""')}"`
}

type CountRow = { count: number }

/**
 * `SELECT count(*)` for one table, resolved through the pool's `search_path`
 * (i.e. the scratch schema first, then `public`). `count(*)::int` makes the
 * driver hand back a JS number instead of the `bigint`-as-string default.
 */
export async function countRows(table: string): Promise<number> {
  const { rows } = await testPool().query<CountRow>(
    `SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`,
  )
  const count = rows[0]?.count
  if (typeof count !== 'number') {
    // count(*) always yields one row, so this cannot happen; returning
    // `undefined` here would let a broken query read as an empty table.
    throw new Error(`countRows("${table}") did not return a numeric count (got ${String(count)}).`)
  }
  return count
}

type TableRow = { table_name: string }

/**
 * Empty the scratch schema between tests: ONE
 * `TRUNCATE <tables> RESTART IDENTITY CASCADE` over every base table in
 * the expected scratch schema, minus the migration journals. `CASCADE` covers the
 * foreign keys between them; `RESTART IDENTITY` makes generated ids predictable
 * for the test that reads them back.
 */
export async function resetTestDatabase(): Promise<void> {
  const pool = testPool()

  // Which schema are we actually about to empty?
  //
  // The pool is opened with `search_path = <scratch>, public`, and
  // `current_schema()` resolves to the first EXISTING entry. So if the scratch
  // schema is absent — dropped by a crashed teardown, or never created because
  // the file was run outside `pnpm test` — `current_schema()` silently becomes
  // `public`: the developer's working database.
  //
  // The `tables.length === 0` check below does NOT catch that. `public` holds
  // the full application fixture, so the list comes back populated and the
  // TRUNCATE proceeds against real data. Measured on a dev database:
  // `SET search_path = peak_test_does_not_exist, public` resolves
  // `current_schema()` to `public` and finds 38 application tables to target.
  //
  // So the schema is verified by NAME against the one globalSetup exported,
  // before anything is discovered or truncated.
  const expectedSchema = process.env.PEAK_TEST_SCHEMA
  if (!expectedSchema) {
    throw new Error(
      'PEAK_TEST_SCHEMA is not set, so resetTestDatabase() cannot confirm ' +
        'which schema it would empty. Run the suite through `pnpm test` so ' +
        'tests/setup/global-db.ts can create the scratch schema and export ' +
        'its name. Refusing to truncate an unverified schema.',
    )
  }
  const quotedExpectedSchema = quoteIdentifier(expectedSchema)

  const { rows: schemaRows } = await pool.query<{ schema: string | null }>(
    'SELECT current_schema() AS schema',
  )
  const actualSchema = schemaRows[0]?.schema

  if (actualSchema !== expectedSchema) {
    throw new Error(
      `resetTestDatabase() refuses to truncate: current_schema() is ` +
        `${actualSchema ?? 'NULL'}, but the scratch schema is ${expectedSchema}. ` +
        'The pool resolves `search_path = <scratch>, public`, so this means the ' +
        'scratch schema is missing and the connection has fallen through to ' +
        (actualSchema === 'public'
          ? 'the developer working database. Truncating it would destroy real data. '
          : 'another schema. ') +
        'Run the suite through `pnpm test` so tests/setup/global-db.ts can ' +
        'recreate and migrate the scratch schema.',
    )
  }

  const { rows } = await pool.query<TableRow>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [expectedSchema],
  )

  const tables = rows
    .map((row) => row.table_name)
    .filter((name) => !MIGRATION_JOURNAL_TABLES.has(name))

  if (tables.length === 0) {
    // An empty scratch schema means globalSetup did not run (or dropped the
    // schema). Throwing turns that into a failing test rather than a suite of
    // tests that all "pass" against nothing.
    throw new Error(
      `resetTestDatabase() found no application tables in ` +
        `${expectedSchema} (${[...MIGRATION_JOURNAL_TABLES].join(', ')} excluded). ` +
        'The scratch schema was never migrated — run the suite through ' +
        '`pnpm test` so tests/setup/global-db.ts can create it. Refusing to ' +
        'report a successful reset against an empty schema.',
    )
  }

  const list = tables.map((table) => `${quotedExpectedSchema}.${quoteIdentifier(table)}`).join(', ')
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/**
 * End the pool and clear the cache, so a later `testPool()` call recreates it
 * against whatever `DATABASE_URL` holds then. Safe to call twice, and safe to
 * call when no pool was ever created.
 */
export async function closeTestPool(): Promise<void> {
  const pool = cachedPool
  if (!pool) return
  cachedPool = null
  await pool.end()
}

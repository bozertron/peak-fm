/**
 * Bring DATABASE_URL up to the schema this checkout expects.
 *
 * Three stages, in this order and for these reasons:
 *
 *   1. BETTER AUTH owns `user`, `session`, `account`, `verification`, and the
 *      additional `user` columns declared in `lib/auth.ts`. Its planner runs
 *      first so `user` exists before anything declares a foreign key to it.
 *      The published `@better-auth/cli` trails the installed core (1.4.x vs
 *      1.7.x), so this drives the plan from the version actually installed and
 *      reads `lib/auth.ts` directly — the plan can never be a second copy that
 *      drifts.
 *
 *   2. DRIZZLE owns every domain table. The SQL under `drizzle/` is GENERATED
 *      from `lib/db/schema/` by `pnpm db:generate` and is never hand-edited.
 *      Applied files are recorded in `_peak_migration` so re-running is cheap.
 *
 *   3. VERIFY walks the Drizzle schema and asserts that every table and every
 *      column actually exists in the database. This stage is the whole point.
 *      AREA-109 found a production sign-in 500 whose root cause was that no
 *      deploy step ever created the tables; nothing detected it because
 *      nothing ever checked. Now something checks, and a mismatch is a
 *      non-zero exit rather than a 500 for a beta tester.
 *
 *   pnpm db:migrate         apply and verify
 *   pnpm db:migrate --print show the Better Auth SQL and exit
 *   pnpm db:migrate --check verify only; apply nothing (use in CI / predeploy)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { createJiti } from 'jiti'
import { getMigrations } from 'better-auth/db/migration'
import { getTableConfig } from 'drizzle-orm/pg-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const print = process.argv.includes('--print')
const checkOnly = process.argv.includes('--check')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

// `lib/*.ts` is TypeScript and imports through the `@/*` tsconfig alias,
// neither of which plain Node resolves.
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { auth } = await jiti.import(resolve(root, 'lib/auth.ts'))
const { pool } = await jiti.import(resolve(root, 'lib/db/index.ts'))
const { schema } = await jiti.import(resolve(root, 'lib/db/schema/index.ts'))

let failed = false

// --- Stage 1: Better Auth -------------------------------------------------

const plan = await getMigrations(auth.options)

if (print) {
  console.log('--- Better Auth SQL ---')
  console.log(await plan.compileMigrations())
  await pool.end()
  process.exit(0)
}

if (!checkOnly) {
  console.log('==> Better Auth schema')
  for (const { table } of plan.toBeCreated) console.log(`    create table  ${table}`)
  for (const { table, fields } of plan.toBeAdded) {
    console.log(`    alter table   ${table} — add ${Object.keys(fields).join(', ')}`)
  }
  for (const { table, name } of plan.toBeAddedIndexes ?? []) {
    console.log(`    create index  ${name} on ${table}`)
  }
  for (const problem of plan.schemaProblems) console.warn(`    schema problem: ${problem}`)
  for (const change of plan.unsafeChanges) console.warn(`    unsafe change:  ${change}`)

  const pending =
    plan.toBeCreated.length + plan.toBeAdded.length + (plan.toBeAddedIndexes?.length ?? 0)
  if (pending === 0) {
    console.log('    already up to date')
  } else {
    await plan.runMigrations()
    console.log(`    applied ${pending} change(s)`)
  }
}

// --- Stage 2: generated domain migrations ---------------------------------

/**
 * Postgres error codes that mean "this object is already there".
 * Tolerated ONLY for the four Better Auth tables, which stage 1 legitimately
 * created a moment ago and which drizzle-kit also emits because they live in
 * the TS schema for foreign-key typing. Every other duplicate is a real
 * problem and is allowed to fail.
 */
const ALREADY_EXISTS = new Set(['42P07', '42710', '42701', '42P16'])
const AUTH_OWNED = ['"user"', '"session"', '"account"', '"verification"']

const isAuthOwned = (statement) => {
  const m = statement.match(/^\s*CREATE (?:UNIQUE )?(?:TABLE|INDEX)[^(]*?("[A-Za-z_]+")/i)
  if (m && AUTH_OWNED.includes(m[1])) return true
  return /^\s*CREATE TABLE\s+("(?:user|session|account|verification)")/i.test(statement)
}

if (!checkOnly) {
  console.log('==> Domain migrations')
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_peak_migration" (
        "name"       text PRIMARY KEY,
        "appliedAt"  timestamptz NOT NULL DEFAULT now(),
        "statements" integer NOT NULL
      )
    `)

    const dir = join(root, 'drizzle')
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    } catch {
      console.error(`    no drizzle/ directory — run 'pnpm db:generate' first`)
      failed = true
    }

    const { rows: done } = await client.query('SELECT name FROM "_peak_migration"')
    const applied = new Set(done.map((r) => r.name))

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`    skip    ${file} (already applied)`)
        continue
      }

      const statements = readFileSync(join(dir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)

      await client.query('BEGIN')
      let ran = 0
      let skipped = 0
      try {
        for (const statement of statements) {
          // A savepoint keeps one tolerated duplicate from poisoning the
          // whole transaction.
          await client.query('SAVEPOINT stmt')
          try {
            await client.query(statement)
            await client.query('RELEASE SAVEPOINT stmt')
            ran++
          } catch (error) {
            await client.query('ROLLBACK TO SAVEPOINT stmt')
            if (ALREADY_EXISTS.has(error.code) && isAuthOwned(statement)) {
              // Expected: Better Auth created this in stage 1.
              skipped++
              continue
            }
            throw error
          }
        }
        await client.query(
          'INSERT INTO "_peak_migration" (name, statements) VALUES ($1, $2)',
          [file, ran],
        )
        await client.query('COMMIT')
        console.log(
          `    apply   ${file} — ${ran} statement(s)` +
            (skipped ? `, ${skipped} skipped (Better Auth owns them)` : ''),
        )
      } catch (error) {
        await client.query('ROLLBACK')
        console.error(`    FAILED  ${file}: [${error.code}] ${error.message}`)
        failed = true
        break
      }
    }
  } finally {
    client.release()
  }
}

// --- Stage 2b: harden the columns Peak added to `user` --------------------

/**
 * Better Auth's planner creates additional fields as plain nullable columns
 * with no database-level default — it applies `defaultValue` in application
 * code instead. Drizzle's mirror declares `role` NOT NULL DEFAULT 'member',
 * so without this stage the TypeScript type would claim non-null on a column
 * the database lets be null, and `getTableConfig` would be describing a table
 * that does not exist as described.
 *
 * These four columns are Peak's, declared in `lib/auth.ts`, so Peak is
 * entitled to constrain them. Better Auth's own columns are left alone.
 */
if (!checkOnly && !failed) {
  console.log('==> Hardening Peak-owned user columns')
  try {
    await pool.query(`UPDATE "user" SET "role" = 'member' WHERE "role" IS NULL`)
    await pool.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'member'`)
    await pool.query(`ALTER TABLE "user" ALTER COLUMN "role" SET NOT NULL`)
    await pool.query(
      `UPDATE "user" SET "avatarKind" = 'initials' WHERE "avatarKind" IS NULL`,
    )
    await pool.query(`ALTER TABLE "user" ALTER COLUMN "avatarKind" SET DEFAULT 'initials'`)
    await pool.query(`ALTER TABLE "user" ALTER COLUMN "avatarKind" SET NOT NULL`)
    console.log('    role, avatarKind — NOT NULL with defaults')
  } catch (error) {
    console.error(`    FAILED: [${error.code}] ${error.message}`)
    failed = true
  }
}

// --- Stage 3: verify ------------------------------------------------------

console.log('==> Verifying schema against lib/db/schema/')

const expected = new Map()
for (const value of Object.values(schema)) {
  // Only Drizzle table objects carry a table config.
  let config
  try {
    config = getTableConfig(value)
  } catch {
    continue
  }
  expected.set(
    config.name,
    config.columns.map((c) => c.name),
  )
}

const { rows: actualRows } = await pool.query(
  `SELECT table_name, column_name
     FROM information_schema.columns
    WHERE table_schema = 'public'`,
)
const actual = new Map()
for (const { table_name, column_name } of actualRows) {
  if (!actual.has(table_name)) actual.set(table_name, new Set())
  actual.get(table_name).add(column_name)
}

let okTables = 0
for (const [table, columns] of [...expected].sort()) {
  const present = actual.get(table)
  if (!present) {
    console.error(`    MISSING TABLE   ${table}`)
    failed = true
    continue
  }
  const missing = columns.filter((c) => !present.has(c))
  if (missing.length) {
    console.error(`    MISSING COLUMNS ${table}: ${missing.join(', ')}`)
    failed = true
    continue
  }
  okTables++
}

console.log(`    ${okTables}/${expected.size} table(s) verified`)

await pool.end()

if (failed) {
  console.error('\nSchema is NOT consistent with lib/db/schema/. Exit 1.')
  process.exit(1)
}
console.log('\nSchema is consistent.')

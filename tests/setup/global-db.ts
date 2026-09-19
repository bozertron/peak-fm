/**
 * vitest `globalSetup` — the scratch-schema lifecycle every test run owns.
 *
 * WHY A SCHEMA AND NOT A DATABASE
 * The `peak` role is `rolsuper = f, rolcreatedb = f`: `CREATE SCHEMA` is
 * allowed, `CREATE DATABASE` is denied. A per-process schema is therefore the
 * only isolation this role can actually buy, and it is enough — the developer's
 * working database is `public` (53 tables) and this file never writes to it.
 *
 * THE LIFECYCLE, ONCE PER TEST PROCESS
 *   1. name the schema after the CURRENT EPOCH MILLISECONDS and the pid —
 *      `peak_test_<epochMs>_<pid>` — so two runs (or two agents) never fight
 *      over one schema AND a later run can decide how old the name is;
 *   2. sweep orphaned scratch schemas a KILLED earlier process stranded (see
 *      `sweepStaleScratchSchemas`), before this run creates its own;
 *   3. drop its own name if a crashed earlier run left it, then create it;
 *   4. run the REAL migration runner (`scripts/db-migrate.mjs`) against it — the
 *      fixture is whatever the production migration produces, never a second
 *      hand-written schema;
 *   5. verify the result against `lib/db/schema/` (the same source of truth the
 *      runner verifies against) and fail loudly if it is incomplete;
 *   6. re-point every foreign key the migration left aimed at another schema
 *      (`public`) at the same-named table inside the scratch schema — see
 *      `repointForeignKeys`, which is the reason the factory helpers work;
 *   7. export the handles into `process.env` so forked workers inherit them (see
 *      `tests/setup/db-env.ts`, which refuses to run without them);
 *   8. return a teardown that drops the schema and ends the pool. It is safe to
 *      call twice.
 *
 * WHY STEPS 2-7 ARE ONE EXPORTED FUNCTION AND NOT A `globalSetup` BODY.
 * They used to be inlined here, and that made the sweep UNASSERTABLE: deleting
 * the `sweepStaleScratchSchemas(...)` call left the whole suite green (170/170)
 * while an orphaned scratch schema survived forever, because
 * `tests/setup/harness-hygiene.test.ts` calls the sweep FUNCTION directly and so
 * proves the function and never the lifecycle. Steps 2-7 now live in
 * `prepareScratchSchema`, which `globalSetup` calls and whose returned schema it
 * checks, and `tests/setup/harness-lifecycle.test.ts` calls the SAME function —
 * so the invocation is part of a test and the protection is no longer silently
 * removable. `globalSetup` keeps owning the one thing the sequence must not:
 * the pool and the name teardown will drop.
 *
 * WHY THE NAME CARRIES ITS CREATION TIME.
 * The teardown in step 8 runs only when this setup resolves AND the process exits
 * cleanly. A test process that is killed, times out, or is OOM-killed therefore
 * strands its scratch schema forever — and because the old name was just
 * `peak_test_<pid>`, a later run never reused or noticed it. Measured after one
 * wave: three orphans (`peak_test_1888021`, `_1892144`, `_1956625`), dropped by
 * hand; every future wave runs many more test processes, so the residue only
 * grows. Step 2 closes the mechanism instead of the symptom: the name now says
 * WHEN it was made, so an orphan is decidable, and the sweep drops exactly the
 * names it can prove are old. A name it cannot read (the old scheme, or anything
 * else under the prefix) is REPORTED and left alone — an unrecognised artifact is
 * not this harness's to delete.
 *
 * The verification in step 5 and the re-pointing in step 6 are the point of the
 * file. `scripts/db-migrate.mjs` verifies against `table_schema = 'public'`, and
 * the developer database has those tables already — so a migration that
 * silently failed inside the scratch schema would still print "38/38 verified".
 * Counting the scratch schema's own tables proves the fixture is complete, and
 * closing its referential graph is what makes it usable.
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { createJiti } from 'jiti'
import { Pool } from 'pg'
import { quoteIdentifier } from '../helpers/db'

/** Every scratch schema this harness creates starts with this. */
export const TEST_SCHEMA_PREFIX = 'peak_test_'

/**
 * How old a scratch schema must be before the sweep will drop it.
 *
 * A live test process is minutes old; two hours cannot race a concurrent run.
 * The comparison in `staleSchemaNames` is STRICTLY greater-than, so a schema
 * exactly this old is still treated as live. That asymmetry is deliberate: the
 * cost of leaving one orphan behind for another run is a wasted schema, while
 * the cost of a wrong drop is a concurrent run losing its fixture mid-test.
 */
export const TEST_SCHEMA_MAX_AGE_MS = 2 * 60 * 60 * 1000

/**
 * The one name shape this harness owns: `peak_test_<epochMs>_<pid>`.
 *
 * `SCHEMA_NAME_PATTERN` is built from `TEST_SCHEMA_PREFIX` rather than spelled
 * out again, so changing the prefix cannot leave the parser behind. The prefix is
 * escaped because `peak_test_` contains no metacharacter today but the *point* of
 * deriving the pattern is that a future prefix might.
 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SCHEMA_NAME_PATTERN = new RegExp(`^${escapeRegExp(TEST_SCHEMA_PREFIX)}([0-9]+)_([0-9]+)$`)

/**
 * Identifiers reach DDL unparameterised, so a name is validated before it gets
 * there rather than trusted. Used both for names this file mints and for names
 * `information_schema` hands back.
 */
function assertSafeSchemaName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`${LOG} refusing to use "${name}" as a schema name.`)
  }
}

/**
 * The scratch schema for one test process: unique per process AND carrying the
 * moment it was made, so age is decidable.
 *
 * Both halves are validated. A fractional epoch, a negative pid or a name that
 * exceeds Postgres's 63-byte identifier limit would all be silently lossy — the
 * first two by producing a name `parseSchemaMadeAt` cannot round-trip, the third
 * by truncation in the catalog — and a name that cannot be read back is exactly
 * the orphan the sweep is not allowed to drop. So they throw here, where the
 * caller is still on the stack.
 */
export function schemaNameFor(nowMs: number, pid: number): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error(
      `${LOG} refusing to name a scratch schema after "${nowMs}": the timestamp must be a ` +
        'non-negative integer number of epoch milliseconds.',
    )
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(
      `${LOG} refusing to name a scratch schema after pid "${pid}": the pid must be a ` +
        'positive integer.',
    )
  }
  const name = `${TEST_SCHEMA_PREFIX}${nowMs}_${pid}`
  assertSafeSchemaName(name)
  if (name.length > 63) {
    throw new Error(
      `${LOG} the scratch schema name "${name}" is ${name.length} characters; Postgres ` +
        'truncates identifiers at 63, which would make the creation time unreadable.',
    )
  }
  return name
}

/**
 * When the schema was made, in epoch milliseconds — or `null` when the name is
 * not one this harness mints.
 *
 * `null` is the load-bearing answer. `peak_test_1234` (the OLD naming scheme,
 * pid with no timestamp), `peak_test_unparseable`, `peak_other` and every other
 * shape all return `null`, and the sweep therefore never touches them: absence of
 * a readable timestamp is not evidence that a schema is dead.
 */
export function parseSchemaMadeAt(name: string): number | null {
  const match = SCHEMA_NAME_PATTERN.exec(name)
  if (!match) return null
  const madeAt = Number(match[1])
  // A digit run longer than 2^53-1 would compare as a float and round; refusing
  // it keeps "old" from being an accident of precision loss.
  if (!Number.isSafeInteger(madeAt)) return null
  return madeAt
}

/**
 * The subset of `existing` this harness may drop: names it recognises as its own
 * (`parseSchemaMadeAt` is non-null) and STRICTLY older than `maxAgeMs`.
 *
 * Age rule, stated once because the boundary is asserted in
 * `tests/setup/harness-hygiene.test.ts`: a schema whose age is exactly
 * `maxAgeMs` is NOT stale. Only `nowMs - madeAt > maxAgeMs` is dropped.
 * A name dated in the future (age < 0 — a clock step, or a name minted by a
 * process whose clock differs) is likewise not stale: it cannot be an orphaned
 * long-dead run, and dropping it could kill a live one.
 *
 * This function decides; `sweepStaleScratchSchemas` performs. Keeping the pure
 * decision separate is what lets the acceptance test assert the fresh case
 * without a database, and the real sweep case with one.
 */
export function staleSchemaNames(
  existing: string[],
  nowMs: number,
  maxAgeMs: number = TEST_SCHEMA_MAX_AGE_MS,
): string[] {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error(
      `${LOG} refusing to sweep with "${nowMs}" as the current time; expected non-negative ` +
        'integer epoch milliseconds. A NaN here would silently sweep nothing.',
    )
  }
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) {
    throw new Error(
      `${LOG} refusing to sweep with "${maxAgeMs}" as the max age; expected a non-negative ` +
        'integer number of milliseconds.',
    )
  }
  return existing.filter((name) => {
    const madeAt = parseSchemaMadeAt(name)
    if (madeAt === null) return false // not ours to judge — reported, never dropped
    const age = nowMs - madeAt
    if (age < 0) return false // dated in the future: treat as live
    return age > maxAgeMs // exactly at the threshold is still live
  })
}

/** One row of `information_schema.schemata`. */
type SchemaRow = { schema_name: string }

/**
 * Drop every scratch schema this harness recognises as stale, and return the
 * names dropped. Names it does not recognise are logged and LEFT ALONE.
 *
 * Called by `prepareScratchSchema` BEFORE this run creates its own schema. The listing is
 * filtered in SQL with `left(schema_name, length($1)) = $1` rather than
 * `LIKE 'peak_test_%'`, because `_` is a LIKE wildcard and this prefix contains
 * two of them — `LIKE` would also match `peakZtest...`, i.e. a schema belonging
 * to someone else.
 *
 * Every identifier reaching DDL is quoted with `quoteIdentifier` and validated
 * first: the names come from the database, not from this file, and "the database
 * gave it to me" is not a reason to interpolate it raw.
 */
export async function sweepStaleScratchSchemas(pool: Pool, nowMs: number): Promise<string[]> {
  const { rows } = await pool.query<SchemaRow>(
    `SELECT schema_name
       FROM information_schema.schemata
      WHERE left(schema_name, length($1)) = $1
      ORDER BY schema_name`,
    [TEST_SCHEMA_PREFIX],
  )

  const candidates = rows.map((row) => row.schema_name)
  const stale = staleSchemaNames(candidates, nowMs)
  const staleSet = new Set(stale)

  for (const name of candidates) {
    if (staleSet.has(name)) continue
    const madeAt = parseSchemaMadeAt(name)
    if (madeAt === null) {
      console.warn(
        `${LOG} sweep: leaving "${name}" alone — its name carries no timestamp this harness ` +
          `can read, so it is not provably an orphan of the "${TEST_SCHEMA_PREFIX}" scheme ` +
          'and is not this harness to drop.',
      )
    } else {
      console.log(
        `${LOG} sweep: leaving "${name}" alone — it is ${Math.round((nowMs - madeAt) / 1000)}s ` +
          `old, at or under the ${Math.round(TEST_SCHEMA_MAX_AGE_MS / 1000)}s staleness ` +
          'threshold, so a live test process could still own it.',
      )
    }
  }

  const dropped: string[] = []
  for (const name of stale) {
    assertSafeSchemaName(name)
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(name)} CASCADE`)
    dropped.push(name)
    console.log(
      `${LOG} sweep: dropped stale scratch schema "${name}" ` +
        `(${Math.round((nowMs - (parseSchemaMadeAt(name) ?? nowMs)) / 1000)}s old, CASCADE)`,
    )
  }

  if (dropped.length === 0) {
    console.log(
      `${LOG} sweep: nothing to drop — ${candidates.length} schema(s) under ` +
        `"${TEST_SCHEMA_PREFIX}" and none of them provably stale.`,
    )
  }
  return dropped
}

/** Repo root, from `tests/setup/global-db.ts`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The documented dev database. Only used when `DATABASE_URL` is absent. */
const DEV_DATABASE_URL = 'postgres://peak:peak@127.0.0.1:5432/peak'

/**
 * Application tables `lib/db/schema/` declares and the migration must produce in
 * the scratch schema. A drift here is a harness bug or a migration bug — either
 * way it is loud, never a quiet pass.
 */
const EXPECTED_TABLE_COUNT = 38

/**
 * Migration bookkeeping tables. Neither is application schema, so neither counts
 * toward `EXPECTED_TABLE_COUNT`.
 *
 * `__drizzle_migrations` is drizzle-kit's journal; this repo does not use
 * drizzle-kit's migrator, so it is listed for completeness. `_peak_migration` is
 * the journal `scripts/db-migrate.mjs` actually writes (measured: the scratch
 * schema holds 39 base tables — these 38 plus `_peak_migration`).
 */
const MIGRATION_JOURNAL_TABLES = new Set(['__drizzle_migrations', '_peak_migration'])

const LOG = '[test-db]'

/**
 * Point a connection string at a schema: `pg` honours the `options` parameter,
 * so every connection made from the returned URL has
 * `current_schema() = <schema>` and resolves unqualified names there first.
 */
export function withSearchPath(url: string, schema: string): string {
  const u = new URL(url)
  // Template literal rather than `'-c search_path=' + schema + ',public'`: the
  // repo's biome `recommended` preset errors on string concatenation
  // (lint/style/useTemplate). The resulting value is identical.
  u.searchParams.set('options', `-c search_path=${schema},public`)
  return u.toString()
}

/** Never log a password. */
function redact(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@/]*@/, '://$1:***@')
}

type ExecFailure = {
  status?: number | null
  stdout?: string | Buffer | null
  stderr?: string | Buffer | null
  message?: string
}

function output(value: string | Buffer | null | undefined): string {
  if (value == null) return '(empty)'
  const text = (typeof value === 'string' ? value : value.toString('utf8')).trimEnd()
  return text === '' ? '(empty)' : text
}

/**
 * Run the real migration runner against the scratch schema. The child gets an
 * explicit `DATABASE_URL`, which wins over `.env.local`: node's `--env-file`
 * does not overwrite a variable that is already set in the environment.
 */
function runMigrations(scratchUrl: string): void {
  console.log(`${LOG} 3/7 migrating: node scripts/db-migrate.mjs (scratch schema, real runner)`)
  try {
    const stdout = execFileSync(
      process.execPath,
      ['--env-file-if-exists=.env.local', 'scripts/db-migrate.mjs'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, DATABASE_URL: scratchUrl },
      },
    )
    for (const line of stdout.trimEnd().split('\n')) console.log(`${LOG}     ${line}`)
  } catch (error) {
    const failure = error as ExecFailure
    throw new Error(
      [
        `${LOG} FAILED: the migration runner exited with ${failure.status ?? '(no status)'} ` +
          'against the scratch schema.',
        `--- stdout ---\n${output(failure.stdout)}`,
        `--- stderr ---\n${output(failure.stderr)}`,
        `--- error ---\n${failure.message ?? String(error)}`,
      ].join('\n'),
      { cause: error },
    )
  }
}

/**
 * THE FOREIGN-KEY RE-POINT — the reason this harness can write anything at all.
 *
 * `drizzle/0000_peak_cloud_domain.sql` is generated, and every one of its 61
 * foreign keys is spelled schema-qualified — `REFERENCES "public"."user"("id")`
 * — because drizzle-kit emits the schema it was generated against. Run with
 * `search_path = <scratch>, public`, its CREATE TABLEs land in the scratch
 * schema, while each `ALTER TABLE ... ADD CONSTRAINT` still aims the key back at
 * `public`. Measured in a fresh scratch schema: 63 foreign keys, 61 of them
 * targeting `public` (the other two are Better Auth's own unqualified keys).
 *
 * The constraints therefore create cleanly — `public` does hold those tables —
 * and then every write through them fails:
 *
 *   insert or update on table "account" violates foreign key constraint
 *   "account_userId_user_id_fk"
 *
 * because the row is validated against an EMPTY `public."user"`. Worse, a run
 * that did satisfy it would be validating test fixtures against the developer's
 * real data. The fixture is not a fixture until its referential graph is closed
 * inside the scratch schema.
 *
 * So, right after the real runner reports success and before any test can
 * connect, each such key is dropped and re-added against the same-named table in
 * the scratch schema, preserving everything `pg_constraint` records: the
 * constraint name, the source and target column order, the MATCH type, the
 * referential actions and the deferrability. The DDL is still entirely the
 * migration's; this step only re-points it.
 *
 * It never guesses. A target table missing from the scratch schema, an
 * unrecognised referential-action code, or a key still pointing outside after
 * the rewrite each throw — the last one being the closing assertion, so a future
 * migration that reintroduces a qualified key fails the run loudly instead of
 * quietly rebuilding this bug.
 */

/**
 * One foreign key whose referenced table lives outside the scratch schema, as
 * `pg_constraint` + `pg_attribute` report it. `source_columns` and
 * `target_columns` are aligned pair-wise: `conkey[i]` references `confkey[i]`.
 *
 * Both aggregates cast through `::text` on purpose. `pg_attribute.attname` is of
 * type `name`, so `array_agg` without the cast returns `name[]` — an OID `pg`
 * has no parser for, which it therefore hands back as the raw string `{userId}`
 * instead of an array (measured: `typeof source_columns === 'string'`). The cast
 * is what makes the column a real `string[]` the code below can iterate.
 */
type ExternalForeignKey = {
  constraint_name: string
  source_table: string
  source_columns: string[]
  target_schema: string
  target_table: string
  target_columns: string[]
  match_type: string
  on_delete: string
  on_update: string
  deferrable: boolean
  deferred: boolean
}

/**
 * Every foreign key owned by `$1` whose target lives in another schema.
 * `ORDER BY` keeps the rewrite (and its log) deterministic.
 */
const EXTERNAL_FOREIGN_KEYS = `
  SELECT
    con.conname                    AS constraint_name,
    source.relname                 AS source_table,
    target_ns.nspname              AS target_schema,
    target.relname                 AS target_table,
    con.confmatchtype              AS match_type,
    con.confdeltype                AS on_delete,
    con.confupdtype                AS on_update,
    con.condeferrable              AS deferrable,
    con.condeferred                AS deferred,
    (SELECT array_agg(att.attname::text ORDER BY key.ordinality)
       FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality)
       JOIN pg_attribute att
         ON att.attrelid = con.conrelid AND att.attnum = key.attnum
    )                              AS source_columns,
    (SELECT array_agg(att.attname::text ORDER BY key.ordinality)
       FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, ordinality)
       JOIN pg_attribute att
         ON att.attrelid = con.confrelid AND att.attnum = key.attnum
    )                              AS target_columns
  FROM pg_constraint con
  JOIN pg_class source        ON source.oid = con.conrelid
  JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
  JOIN pg_class target        ON target.oid = con.confrelid
  JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
 WHERE con.contype = 'f'
   AND source_ns.nspname = $1
   AND target_ns.nspname <> $1
 ORDER BY source.relname, con.conname`

/**
 * `confmatchtype` codes → SQL. `p` (MATCH PARTIAL) is declared by the standard
 * but not implemented by Postgres, so seeing it means the catalog was misread —
 * the lookup below throws rather than substituting a different semantics.
 */
const MATCH_TYPES: Record<string, string> = {
  f: 'MATCH FULL',
  p: 'MATCH PARTIAL',
  s: 'MATCH SIMPLE',
}

/** `confdeltype` / `confupdtype` codes → SQL. */
const REFERENTIAL_ACTIONS: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
}

/** Look a catalog code up, refusing to invent a meaning for an unknown one. */
function codeFor(table: Record<string, string>, code: string, what: string): string {
  const found = table[code]
  if (!found) {
    throw new Error(
      `${LOG} pg_constraint reported ${what} code "${code}", which this harness does not ` +
        'know how to reproduce in DDL. Refusing to guess a referential semantic.',
    )
  }
  return found
}

/** A base table of the scratch schema, for the "does the target exist here" check. */
type RelationRow = { relation_name: string }

/**
 * Re-point every foreign key in `schema` whose target lives in another schema at
 * the same-named relation inside `schema`. Throws (never warns) if the target is
 * absent from the scratch schema, and asserts at the end that none remain.
 */
async function repointForeignKeys(pool: Pool, schema: string): Promise<void> {
  const client = await pool.connect()
  try {
    const { rows: external } = await client.query<ExternalForeignKey>(EXTERNAL_FOREIGN_KEYS, [
      schema,
    ])

    if (external.length === 0) {
      console.log(
        `${LOG} 5/7 referential graph: every foreign key already resolves inside "${schema}"`,
      )
      return
    }

    // The rewrite is only valid if the same-named target exists in this schema —
    // otherwise re-pointing would produce a missing-table error, or silently
    // drop a constraint if the DDL were made lenient. Check first, name names.
    const { rows: relations } = await client.query<RelationRow>(
      `SELECT c.relname AS relation_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')`,
      [schema],
    )
    const present = new Set(relations.map((row) => row.relation_name))
    const absent = [
      ...new Set(
        external
          .filter((fk) => !present.has(fk.target_table))
          .map(
            (fk) =>
              `${fk.target_schema}.${fk.target_table} (referenced by ` +
              `${schema}.${fk.source_table}.${fk.constraint_name})`,
          ),
      ),
    ]
    if (absent.length > 0) {
      throw new Error(
        `${LOG} the scratch schema "${schema}" is missing the target of ` +
          `${absent.length} foreign key(s), so its referential graph cannot be closed:\n` +
          absent.map((line) => `  - ${line}`).join('\n'),
      )
    }

    await client.query('BEGIN')
    try {
      for (const fk of external) {
        const source = `${quoteIdentifier(schema)}.${quoteIdentifier(fk.source_table)}`
        const target = `${quoteIdentifier(schema)}.${quoteIdentifier(fk.target_table)}`
        const sourceColumns = fk.source_columns.map(quoteIdentifier).join(', ')
        const targetColumns = fk.target_columns.map(quoteIdentifier).join(', ')
        const onDelete = codeFor(REFERENTIAL_ACTIONS, fk.on_delete, 'ON DELETE')
        const onUpdate = codeFor(REFERENTIAL_ACTIONS, fk.on_update, 'ON UPDATE')
        const match = codeFor(MATCH_TYPES, fk.match_type, 'MATCH')
        const deferrable = fk.deferrable
          ? `DEFERRABLE INITIALLY ${fk.deferred ? 'DEFERRED' : 'IMMEDIATE'}`
          : 'NOT DEFERRABLE'

        await client.query(
          `ALTER TABLE ${source} DROP CONSTRAINT ${quoteIdentifier(fk.constraint_name)}`,
        )
        await client.query(
          `ALTER TABLE ${source} ADD CONSTRAINT ${quoteIdentifier(fk.constraint_name)} ` +
            `FOREIGN KEY (${sourceColumns}) REFERENCES ${target} (${targetColumns}) ` +
            `${match} ON DELETE ${onDelete} ON UPDATE ${onUpdate} ${deferrable}`,
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    // The closing assertion. Everything above is a claim about the catalog; this
    // is the catalog disagreeing or not.
    const { rows: remaining } = await client.query<ExternalForeignKey>(EXTERNAL_FOREIGN_KEYS, [
      schema,
    ])
    if (remaining.length > 0) {
      throw new Error(
        `${LOG} ${remaining.length} foreign key(s) in "${schema}" still point at another ` +
          `schema after the re-point: ${remaining
            .map(
              (fk) =>
                `${fk.source_table}.${fk.constraint_name} -> ${fk.target_schema}.${fk.target_table}`,
            )
            .join(', ')}`,
      )
    }

    const sources = [...new Set(external.map((fk) => fk.source_table))].sort()
    console.log(
      `${LOG} 5/7 referential graph: re-pointed ${external.length} foreign key(s) ` +
        `across ${sources.length} table(s) to "${schema}" — every key now resolves locally`,
    )
  } finally {
    client.release()
  }
}

/**
 * The tables `lib/db/schema/` declares, keyed by table name with their column
 * names. Loaded through `jiti` for the same reason the migration runner loads it
 * through `jiti`: `lib/*.ts` is TypeScript, imports through the `@/*` alias, and
 * plain Node resolves neither.
 */
async function expectedTables(): Promise<Map<string, string[]>> {
  const jiti = createJiti(import.meta.url, { alias: { '@': ROOT } })
  const module = (await jiti.import(resolve(ROOT, 'lib/db/schema/index.ts'))) as {
    schema?: Record<string, unknown>
  }
  if (!module.schema) {
    throw new Error(
      `${LOG} lib/db/schema/index.ts did not export a \`schema\` object, so the ` +
        'scratch schema cannot be verified against it.',
    )
  }

  const expected = new Map<string, string[]>()
  for (const value of Object.values(module.schema)) {
    // Only Drizzle table objects carry a table config; helpers and enums do not.
    let config: ReturnType<typeof getTableConfig>
    try {
      config = getTableConfig(value as Parameters<typeof getTableConfig>[0])
    } catch {
      continue
    }
    expected.set(
      config.name,
      config.columns.map((column) => column.name),
    )
  }
  return expected
}

type TableRow = { table_name: string }
type ColumnRow = { table_name: string; column_name: string }

/** Base tables and columns of one schema, read straight from `information_schema`. */
async function inspectSchema(
  pool: Pool,
  schema: string,
): Promise<{ tables: Set<string>; columns: Map<string, Set<string>> }> {
  const { rows: tableRows } = await pool.query<TableRow>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'`,
    [schema],
  )
  const { rows: columnRows } = await pool.query<ColumnRow>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = $1`,
    [schema],
  )

  const columns = new Map<string, Set<string>>()
  for (const { table_name, column_name } of columnRows) {
    let set = columns.get(table_name)
    if (!set) {
      set = new Set()
      columns.set(table_name, set)
    }
    set.add(column_name)
  }
  return { tables: new Set(tableRows.map((row) => row.table_name)), columns }
}

/** Throw unless the scratch schema is exactly the schema the application expects. */
function assertComplete(
  schema: string,
  expected: Map<string, string[]>,
  actualTables: Set<string>,
  actualColumns: Map<string, Set<string>>,
): void {
  const missingTables = [...expected.keys()].filter((t) => !actualTables.has(t)).sort()
  const unexpectedTables = [...actualTables].filter((t) => !expected.has(t)).sort()
  const missingColumns: string[] = []
  for (const [table, columns] of expected) {
    const present = actualColumns.get(table)
    if (!present) continue // already reported as a missing table
    const missing = columns.filter((column) => !present.has(column))
    if (missing.length) missingColumns.push(`${table}(${missing.join(', ')})`)
  }

  const problems: string[] = []
  if (missingTables.length) problems.push(`missing table(s): ${missingTables.join(', ')}`)
  if (missingColumns.length) problems.push(`missing column(s): ${missingColumns.join(', ')}`)
  if (unexpectedTables.length) {
    problems.push(
      'table(s) present that lib/db/schema/ does not declare (schema drift, or a ' +
        `journal table missing from MIGRATION_JOURNAL_TABLES): ${unexpectedTables.join(', ')}`,
    )
  }
  if (actualTables.size !== EXPECTED_TABLE_COUNT) {
    problems.push(
      `the scratch schema holds ${actualTables.size} application base table(s); ` +
        `exactly ${EXPECTED_TABLE_COUNT} are required`,
    )
  }
  if (expected.size !== EXPECTED_TABLE_COUNT) {
    problems.push(
      `lib/db/schema/ declares ${expected.size} table(s) but EXPECTED_TABLE_COUNT is ` +
        `${EXPECTED_TABLE_COUNT} — the migration and the schema have diverged`,
    )
  }

  if (problems.length) {
    throw new Error(
      `${LOG} the scratch schema "${schema}" is NOT complete:\n  - ${problems.join('\n  - ')}`,
    )
  }
}

/**
 * The database URL behind `pool`, with any `search_path` option removed.
 *
 * `prepareScratchSchema` has to hand the REAL migration runner a `DATABASE_URL`
 * aimed at a schema that does not exist yet, so it needs the database behind the
 * pool it was given — not the schema that pool is currently pointed at. It reads
 * `pool.options.connectionString`, which `pg-pool` keeps verbatim
 * (`node_modules/pg-pool/index.js:69`, `this.options = Object.assign({}, options)`,
 * @types/pg `PoolOptions extends PoolConfig` declares `connectionString`), and
 * drops the `options` parameter `withSearchPath` added; every other parameter a
 * real URL carries (`sslmode`, …) is preserved, because it is the same URL object
 * round-tripped rather than a string rebuilt from parts.
 *
 * A pool built from host/port fields instead of a connection string has no URL to
 * read: that throws here rather than migrating the developer's database.
 */
function adminUrlOf(pool: Pool): string {
  const configured = pool.options.connectionString
  if (typeof configured !== 'string' || configured === '') {
    throw new Error(
      `${LOG} the pool handed to prepareScratchSchema was not created from a connection ` +
        'string, so there is no database URL to point the migration runner at. Pass a ' +
        'pool built from a connection string (see tests/helpers/db.ts:testPool).',
    )
  }
  const url = new URL(configured)
  url.searchParams.delete('options')
  return url.toString()
}

/**
 * THE LIFECYCLE, AS ONE ASSERTABLE FUNCTION: sweep the orphans a killed earlier
 * process stranded → drop and create `schemaNameFor(nowMs, pid)` → migrate it
 * with the REAL runner → verify the 38 application tables against
 * `lib/db/schema/` → close its referential graph → export the handles into
 * `process.env`. Returns the schema it prepared.
 *
 * This is the exact path `globalSetup` runs, and it is deliberately exported: a
 * test that calls it exercises the lifecycle rather than one function inside it,
 * so deleting the sweep breaks a test instead of passing unnoticed (see the
 * module header). The caller owns the pool and the teardown — this function
 * never closes a pool, and never touches the module-level `scratchPool` /
 * `liveSchema` that `globalSetup`'s teardown drops.
 *
 * It DOES assign `process.env.PEAK_TEST_SCHEMA`, `PEAK_TEST_DATABASE_URL` and
 * `DATABASE_URL` — that handover is step 7 of the lifecycle and the forked
 * workers cannot run without it. A caller that is not `globalSetup` (i.e. a test)
 * must save those three values first and restore them afterwards, or the next
 * test file in this worker inherits a schema that its `afterAll` dropped.
 */
export async function prepareScratchSchema(
  pool: Pool,
  nowMs: number,
  pid: number,
): Promise<string> {
  // The name is interpolated into DDL (identifiers cannot be parameterised), so
  // it is validated rather than trusted — `schemaNameFor` asserts it too, and
  // this second guard is the one the sweep's DDL relies on as well.
  const schema = schemaNameFor(nowMs, pid)
  assertSafeSchemaName(schema)
  const scratchUrl = withSearchPath(adminUrlOf(pool), schema)

  // 2. Sweep BEFORE creating this run's own schema. A killed or timed-out
  //    earlier process never reached its teardown, so its schema outlives it
  //    and — unlike the old pid-only name — would never be reused. Only names
  //    carrying a readable timestamp older than TEST_SCHEMA_MAX_AGE_MS are
  //    dropped; anything else under the prefix is reported and left alone.
  console.log(
    `${LOG} sweep: looking for orphaned scratch schemas older than ` +
      `${Math.round(TEST_SCHEMA_MAX_AGE_MS / 1000)}s`,
  )
  const swept = await sweepStaleScratchSchemas(pool, nowMs)
  console.log(
    `${LOG} sweep: dropped ${swept.length} stale schema(s)` +
      `${swept.length ? `: ${swept.join(', ')}` : ''}`,
  )

  // 3. A crashed earlier run must not be able to poison this one.
  await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`)
  await pool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`)
  console.log(`${LOG} 2/7 reset: dropped (if it existed) and created schema "${schema}"`)

  runMigrations(scratchUrl)

  // 4. Verify the scratch schema itself, not the developer's `public`.
  const expected = await expectedTables()
  const { tables, columns } = await inspectSchema(pool, schema)
  const application = new Set([...tables].filter((table) => !MIGRATION_JOURNAL_TABLES.has(table)))
  const journals = [...tables].filter((table) => MIGRATION_JOURNAL_TABLES.has(table))
  assertComplete(schema, expected, application, columns)
  console.log(
    `${LOG} 4/7 verified: ${application.size}/${EXPECTED_TABLE_COUNT} application table(s) ` +
      `present in "${schema}"${journals.length ? ` (journal: ${journals.join(', ')})` : ''}`,
  )

  // 5. Close the referential graph. The migration's keys were generated
  //    against `public`; until they are re-pointed, every write that crosses a
  //    key is validated against the developer's tables (see `repointForeignKeys`).
  await repointForeignKeys(pool, schema)

  // 6. Hand the handles to the workers, which fork after this returns.
  process.env.PEAK_TEST_SCHEMA = schema
  process.env.PEAK_TEST_DATABASE_URL = scratchUrl
  process.env.DATABASE_URL = scratchUrl
  console.log(`${LOG} 6/7 exported PEAK_TEST_SCHEMA, PEAK_TEST_DATABASE_URL, DATABASE_URL`)

  return schema
}

/** The pool the teardown owns, plus the schema it points at. */
let scratchPool: Pool | null = null
let liveSchema: string | null = null

export default async function globalSetup(): Promise<() => Promise<void>> {
  // 1. Per-process name, carrying the epoch milliseconds it was made in: two
  //    test processes must never share a schema, and a later run must be able to
  //    tell how old this one is (see `sweepStaleScratchSchemas`).
  const nowMs = Date.now()
  const schema = schemaNameFor(nowMs, process.pid)

  const adminUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL
  const scratchUrl = withSearchPath(adminUrl, schema)
  console.log(`${LOG} 1/7 schema=${schema} admin=${redact(adminUrl)}`)

  const pool = new Pool({ connectionString: scratchUrl })
  scratchPool = pool
  liveSchema = schema

  try {
    // 2-6. The lifecycle itself, in the exported function above — the very path
    //      tests/setup/harness-lifecycle.test.ts drives, so the sweep's presence
    //      in it is asserted rather than assumed.
    const prepared = await prepareScratchSchema(pool, nowMs, process.pid)
    // The pool was opened with `search_path = schema`; the sequence must have
    // prepared that same name, or the exported DATABASE_URL and this pool would
    // disagree about where the fixture is. Never a silent mismatch.
    if (prepared !== schema) {
      throw new Error(
        `${LOG} prepareScratchSchema prepared "${prepared}" but this run's pool is pointed ` +
          `at "${schema}"; refusing to export a DATABASE_URL the fixture is not in.`,
      )
    }
  } catch (error) {
    // Leave no partial schema behind, and never hide why setup failed.
    console.error(`${LOG} setup failed; dropping "${schema}" so no partial schema survives`)
    scratchPool = null
    liveSchema = null
    try {
      await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`)
    } catch (cleanupError) {
      console.error(`${LOG} could not drop "${schema}" after the failure:`, cleanupError)
    }
    await pool.end()
    throw error
  }

  // 6. Teardown: idempotent, so a double call cannot throw or leak.
  return async function teardown(): Promise<void> {
    const ownedPool = scratchPool
    const ownedSchema = liveSchema
    if (!ownedPool || !ownedSchema) {
      console.log(`${LOG} 7/7 teardown: already done, nothing to drop`)
      return
    }
    scratchPool = null
    liveSchema = null
    console.log(`${LOG} 7/7 teardown: dropping schema "${ownedSchema}" CASCADE and ending the pool`)
    try {
      await ownedPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(ownedSchema)} CASCADE`)
    } finally {
      await ownedPool.end()
    }
    console.log(`${LOG} teardown complete: "${ownedSchema}" is gone and the pool is closed`)
  }
}

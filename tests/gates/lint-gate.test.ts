/**
 * NEGATIVE CONTROL for the lint gate (PEAK-207, unit 2 of 2).
 *
 * PEAK-207's acceptance criteria say that an unused import and an empty catch
 * must each make lint fail. A sentence in a report does not satisfy that, and a
 * gate that has never been observed to fail has not been tested — it has only
 * been observed to not-complain. This file is the durable control that observes
 * the failure: it writes two throwaway fixtures, runs the project's real Biome
 * binary over them, and asserts that the clean one passes while the dirty one
 * fails with both rule ids named.
 *
 * It fails loudly — never skips — when the Biome binary is absent or cannot be
 * spawned. A control that quietly degrades into a pass is worse than no control
 * at all, because it certifies a gate that nobody has actually run.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// tests/gates/lint-gate.test.ts -> repo root, which is the absolute path the
// ticket names: <repo>/node_modules/.bin/biome.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIOME_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'biome')

// Single quotes, no semicolons, 2-space indent: a file the gate must accept.
const CLEAN_FIXTURE = `export function add(left: number, right: number): number {
  return left + right
}
`

// Exactly two violations and nothing else:
//   import { readFileSync } from 'node:fs'  -> correctness/noUnusedImports
//   catch {}                                -> suspicious/noEmptyBlockStatements
const DIRTY_FIXTURE = `import { readFileSync } from 'node:fs'

export function swallow(): void {
  try { JSON.parse('{') } catch {}
}
`

type LintRun = { exitCode: number; output: string }

let fixtureDir: string | undefined
let cleanFile = ''
let dirtyFile = ''

/** Narrow a thrown value to a real process exit. Spawn failures have no status. */
function asProcessExit(
  error: unknown,
): { status: number; stdout?: unknown; stderr?: unknown } | null {
  if (typeof error !== 'object' || error === null) return null
  const candidate = error as { status?: unknown; stdout?: unknown; stderr?: unknown }
  if (typeof candidate.status !== 'number') return null
  return { status: candidate.status, stdout: candidate.stdout, stderr: candidate.stderr }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Biome prints the file summary on stdout and the diagnostics on stderr, so both
 * streams are kept — reading only one would silently drop the rule ids that this
 * control asserts on. A non-zero exit is returned as data rather than thrown.
 * Anything without an exit status (ENOENT, spawn failure) is re-thrown so a
 * missing linter can never be mistaken for the lint failure under test.
 *
 * `cwd` is pinned to the repo root because Biome resolves `biome.json` from the
 * working directory: run elsewhere, `noUnusedImports` degrades to a warning and
 * exits 0, and `noEmptyBlockStatements` is not reported at all.
 */
function runLint(file: string): LintRun {
  try {
    const stdout = execFileSync(BIOME_BIN, ['lint', file], { cwd: REPO_ROOT, encoding: 'utf8' })
    return { exitCode: 0, output: stdout }
  } catch (error) {
    const exit = asProcessExit(error)
    if (exit === null) throw error
    return { exitCode: exit.status, output: `${asText(exit.stdout)}${asText(exit.stderr)}` }
  }
}

beforeAll(() => {
  if (!existsSync(BIOME_BIN)) {
    throw new Error(
      `Biome is not installed at ${BIOME_BIN}, so the lint gate cannot be ` +
        'exercised. Register @biomejs/biome in package.json and run pnpm ' +
        'install. This control fails rather than skipping on purpose: an ' +
        'unrunnable gate must be indistinguishable from a failing one.',
    )
  }
  fixtureDir = mkdtempSync(join(tmpdir(), 'peak-lint-gate-'))
  cleanFile = join(fixtureDir, 'clean.ts')
  dirtyFile = join(fixtureDir, 'dirty.ts')
  writeFileSync(cleanFile, CLEAN_FIXTURE, 'utf8')
  writeFileSync(dirtyFile, DIRTY_FIXTURE, 'utf8')
})

afterAll(() => {
  if (fixtureDir !== undefined) rmSync(fixtureDir, { recursive: true, force: true })
})

describe('lint gate negative control (PEAK-207)', () => {
  it('passes the clean fixture', () => {
    const result = runLint(cleanFile)
    expect(result.exitCode, `lint should exit 0 but biome reported:\n${result.output}`).toBe(0)
  })

  it('fails the fixture with an unused import and an empty catch', () => {
    const result = runLint(dirtyFile)
    expect(
      result.exitCode,
      `lint exit 0 with an unused import and an empty catch:\n${result.output}`,
    ).not.toBe(0)
    expect(result.output).toContain('noUnusedImports')
    expect(result.output).toContain('noEmptyBlockStatements')
  })

  it('keeps the dirty fixture actually dirty on disk', () => {
    // Anti-vacuity: were the fixture ever quietly repaired, the two rule-id
    // assertions above could no longer fail and this control would be theatre.
    const source = readFileSync(dirtyFile, 'utf8')
    expect(source).toContain(`import { readFileSync } from 'node:fs'`)
    expect(source).toMatch(/catch\s*\{\s*\}/)
  })
})

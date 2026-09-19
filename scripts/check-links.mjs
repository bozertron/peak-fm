/**
 * Dead-link guard.
 *
 * Extracts every internal href from the shipped source and checks it against a
 * running server. A link in the UI that 404s is a defect a beta tester will
 * find in their first thirty seconds, and it is invisible to `typecheck`,
 * `build` and the schema verifier — all three pass with every call-to-action
 * on every surface pointing at nothing.
 *
 * That is exactly what happened: the surface pages were written with their
 * real destinations linked before the tickets that create those destinations
 * had run. This script makes that class of bug impossible to ship silently.
 *
 * Usage:
 *   pnpm build && pnpm start          # in another shell
 *   node scripts/check-links.mjs
 *   node scripts/check-links.mjs --allow-known   # tolerate KNOWN_MISSING
 *
 * Exit codes: 0 all links resolve (or only known gaps remain), 1 otherwise.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.PEAK_BASE_URL ?? 'http://localhost:3000'
const allowKnown = process.argv.includes('--allow-known')

/**
 * Routes that are linked but not yet built, each owned by a ticket.
 *
 * This list may only SHRINK. Adding to it requires the ticket that will
 * remove it again — see tickets/peak-cloud/PEAK-205-route-inventory.md.
 */
const KNOWN_MISSING = new Map([
  ['/account/history', 'PEAK-310'],
  ['/listing/:id', 'PEAK-213'],
  ['/sell/new', 'PEAK-220'],
  ['/sell/:id', 'PEAK-220'],
  ['/rent/build', 'PEAK-260'],
  ['/rent/roi', 'PEAK-261'],
  ['/rent/roi/:id', 'PEAK-261'],
  ['/rent/autopay', 'PEAK-262'],
  ['/trade/create', 'PEAK-270'],
  ['/trade/offer/:id', 'PEAK-270'],
  ['/find/new', 'PEAK-280'],
  ['/find/:id', 'PEAK-280'],
  ['/plans/new', 'PEAK-290'],
  ['/plans/:id', 'PEAK-290'],
  ['/plans/proposal/:id', 'PEAK-290'],
  ['/plans/community/:id', 'PEAK-291'],
  ['/communicate/new', 'PEAK-300'],
  ['/communicate/:id', 'PEAK-300'],
  ['/communicate/bulletin/new', 'PEAK-300'],
])

const files = execSync('git ls-files', { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .filter((f) => /^(app|components)\/.*\.tsx$/.test(f))

/** Collect hrefs, normalising template interpolation to a `:id` placeholder. */
const found = new Map()
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8')
  const hrefs = [
    ...[...text.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]),
    ...[...text.matchAll(/href=\{`(\/[^`]*)`\}/g)].map((m) => m[1]),
  ]
  for (const raw of hrefs) {
    // `/listing/${item.id}` -> `/listing/:id`; drop the query string.
    const path = raw.replace(/\$\{[^}]*\}/g, ':id').split('?')[0].replace(/\/$/, '') || '/'
    if (!found.has(path)) found.set(path, new Set())
    found.get(path).add(file)
  }
}

const check = async (path) => {
  // A concrete id so dynamic segments resolve to a real request.
  const url = base + path.replace(/:id/g, 'link-check-probe')
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.status
  } catch (error) {
    return `ERR ${error.message}`
  }
}

console.log(`Checking ${found.size} distinct internal links against ${base}\n`)

const broken = []
const knownGaps = []
const ok = []

for (const [path, sources] of [...found].sort()) {
  const status = await check(path)
  const good = typeof status === 'number' && status < 400
  if (good) {
    ok.push(path)
  } else if (KNOWN_MISSING.has(path)) {
    knownGaps.push([path, KNOWN_MISSING.get(path), status])
  } else {
    broken.push([path, [...sources], status])
  }
}

console.log(`  ${ok.length} resolve`)

if (knownGaps.length) {
  console.log(`\n  ${knownGaps.length} known gap(s), each owned by a ticket:`)
  for (const [path, ticket, status] of knownGaps) {
    console.log(`    ${status}  ${path.padEnd(30)} ${ticket}`)
  }
}

if (broken.length) {
  console.log(`\n  ${broken.length} BROKEN link(s) with no owning ticket:`)
  for (const [path, sources, status] of broken) {
    console.log(`    ${status}  ${path}`)
    for (const s of sources) console.log(`            ${s}`)
  }
  console.log('\nEither build the route, or add it to KNOWN_MISSING with its ticket.')
  process.exit(1)
}

if (knownGaps.length && !allowKnown) {
  console.log('\nKnown gaps remain. Pass --allow-known to treat this as a pass.')
  process.exit(1)
}

console.log('\nNo unowned dead links.')

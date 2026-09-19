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
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import ts from 'typescript'

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

const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
if (!configPath) throw new Error('tsconfig.json not found')

const config = ts.readConfigFile(configPath, ts.sys.readFile)
if (config.error) {
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
}

const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options)
const checker = program.getTypeChecker()

const unwrap = (node) => {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression
  }
  return node
}

/** Resolve the static values of a TSX expression. Dynamic values return []. */
const staticValues = (input, seen = new Set()) => {
  const node = unwrap(input)
  if (seen.has(node)) return []

  if (ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isTemplateExpression(node)) {
    const value = node.templateSpans.reduce(
      (text, span) => `${text}\${${span.expression.getText()}}${span.literal.text}`,
      node.head.text,
    )
    return [value]
  }
  if (ts.isConditionalExpression(node)) {
    return [...staticValues(node.whenTrue, seen), ...staticValues(node.whenFalse, seen)]
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticValues(node.left, seen)
    const right = staticValues(node.right, seen)
    return left.flatMap((a) => right.map((b) => `${a}${b}`))
  }
  if (ts.isArrayLiteralExpression(node)) {
    return [node.elements.flatMap((element) => staticValues(element, seen))]
  }
  if (ts.isObjectLiteralExpression(node)) {
    const object = new Map()
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = property.name && ts.isComputedPropertyName(property.name)
          ? undefined
          : property.name.getText().replace(/^['"]|['"]$/g, '')
        if (name) object.set(name, staticValues(property.initializer, seen))
      } else if (ts.isShorthandPropertyAssignment(property)) {
        object.set(property.name.text, staticValues(property.name, seen))
      }
    }
    return [object]
  }
  if (ts.isPropertyAccessExpression(node)) {
    return staticValues(node.expression, seen).flatMap((value) =>
      value instanceof Map ? (value.get(node.name.text) ?? []) : [],
    )
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const keys = staticValues(node.argumentExpression, seen)
    return staticValues(node.expression, seen).flatMap((value) =>
      value instanceof Map ? keys.flatMap((key) => value.get(String(key)) ?? []) : [],
    )
  }
  if (!ts.isIdentifier(node)) return []

  let symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return []
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)

  const nextSeen = new Set(seen).add(node)
  return (symbol.declarations ?? []).flatMap((declaration) => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return staticValues(declaration.initializer, nextSeen)
    }
    if (ts.isParameter(declaration)) {
      const callback = declaration.parent
      const call = callback.parent
      if (
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        call.expression.name.text === 'map' &&
        callback.parameters[0] === declaration
      ) {
        return staticValues(call.expression.expression, nextSeen).flatMap((value) =>
          Array.isArray(value) ? value : [],
        )
      }
    }
    return []
  })
}

/** Collect hrefs, normalising template interpolation to a `:id` placeholder. */
const found = new Map()
for (const file of files) {
  const source = program.getSourceFile(join(root, file))
  if (!source) throw new Error(`TypeScript did not load ${file}`)

  const hrefs = []
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === 'href' && node.initializer) {
      const expression = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer
      if (expression) hrefs.push(...staticValues(expression))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  for (const raw of hrefs) {
    if (typeof raw !== 'string' || !raw.startsWith('/')) continue
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
  } else if (status === 404 && KNOWN_MISSING.has(path)) {
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

/**
 * End-to-end smoke test against a RUNNING server.
 *
 * This is the test that verified the foundation wave. It is kept because the
 * tickets in `tickets/peak-cloud/` require browser evidence, and because rule 6
 * of `tickets/doctrine/PROHIBITED.txt` does not accept "it works" without the
 * real command and its actual output.
 *
 * What it proves, end to end, against a real database:
 *   - the landing pitch renders with seven nav verbs and seven pitch cards
 *   - sign-in works and the header reflects the session
 *   - Buy's filters are URL-driven and server-rendered
 *   - a Server Action write (profile) succeeds and reports honestly
 *   - the admin role gate admits an admin
 *   - a feature-flag toggle takes effect WITHOUT a deploy
 *   - privileged actions land in the append-only audit log
 *
 * Prerequisites:
 *   Playwright, which is deliberately NOT a project dependency — it pulls
 *     browser binaries and only the verification path needs it:
 *       npm i -g playwright   (or install it in a scratch directory)
 *     Point PLAYWRIGHT_CHROMIUM at a browser binary if the default is wrong.
 *   pnpm db:migrate && pnpm db:seed
 *   a user with email tester@peak.local, password correct-horse-battery,
 *     promoted with:  UPDATE "user" SET role='admin' WHERE email='tester@peak.local';
 *   feature flag surface.buy set to false (the test asserts it starts off)
 *   pnpm build && pnpm start
 *
 * Then:
 *   node scripts/smoke-test.mjs
 *
 * Use localhost, not 127.0.0.1 — they are different origins to Better Auth and
 * BETTER_AUTH_URL names the first. See docs/PEAK-ARCHITECTURE.md section 4.2.
 *
 * The only expected console error is a 404 for /_vercel/insights/script.js,
 * which is normal off Vercel. See open decision D3.
 */
import { chromium } from 'playwright'

const base = 'http://localhost:3000'
// PLAYWRIGHT_CHROMIUM lets a CI image point at its own browser binary.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
)
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

function check(label, cond) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) process.exitCode = 1
}

// --- Landing pitch ---
console.log('== Landing ==')
await page.goto(base, { waitUntil: 'domcontentloaded' })
check('hero headline', await page.locator('h1').first().isVisible())
check('7 nav verbs', (await page.locator('nav[aria-label="Primary"] a').count()) === 7)
check('7 pitch cards', (await page.locator('.pitch-card').count()) === 7)
await page.screenshot({ path: 'smoke-landing.png', fullPage: false })

// --- Sign in ---
console.log('== Sign in ==')
await page.goto(`${base}/sign-in`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', 'tester@peak.local')
await page.fill('input[type="password"]', 'correct-horse-battery')
await page.click('button[type="submit"]')
await page.waitForURL(`${base}/`, { timeout: 15000 })
check('signed in, name in header', await page.locator('.profile-name').isVisible())

// --- Buy filters actually filter (URL-driven) ---
console.log('== Buy ==')
await page.goto(`${base}/buy`, { waitUntil: 'domcontentloaded' })
check('empty state honest', (await page.locator('.empty-state h3').innerText()).includes('Big White'))
await page.locator('.category-rail a').filter({ hasText: 'Tools' }).first().click()
await page.waitForURL(/category=tools-equipment/, { timeout: 15000 })
check('category in URL', page.url().includes('category=tools-equipment'))
await page.waitForSelector('.filter-tab.selected', { timeout: 15000 })
check('category tab selected', (await page.locator('.filter-tab.selected').innerText()).includes('Tools'))

// --- Account: server action write ---
console.log('== Account (Server Action write) ==')
await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' })
await page.locator('input[name="avatarKind"][value="ridge"]').check()
await page.fill('input[name="avatarSeed"]', 'granite-ridge-7')
check('live preview is svg', await page.locator('.account-graphic-preview svg').isVisible())
await page.click('button[type="submit"]')
await page.waitForSelector('.form-ok', { timeout: 15000 })
check('save reported ok', (await page.locator('.form-ok').innerText()).includes('Saved'))
await page.screenshot({ path: 'smoke-account.png' })

// --- Admin: flag toggle + audit log ---
console.log('== Admin (Server Action + audit) ==')
await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' })
check('admin reachable', (await page.locator('h1').innerText()).includes('actually is'))
const buyRow = page.locator('tr', { has: page.locator('code', { hasText: 'surface.buy' }) })
check('surface.buy starts off', (await buyRow.locator('.toggle').innerText()).trim() === 'Off')
await buyRow.locator('.toggle').click()
await page.waitForFunction(
  () => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.querySelector('code')?.textContent === 'surface.buy')
    return row?.querySelector('.toggle')?.textContent?.trim() === 'On'
  },
  { timeout: 15000 },
)
check('surface.buy toggled on', true)

// --- Invite creation ---
await page.fill('.invite-form input[name="note"]', 'First beta tester')
await page.click('.invite-form button[type="submit"]')
await page.waitForSelector('.invite-form .form-ok', { timeout: 15000 })
const inviteMsg = await page.locator('.invite-form .form-ok').innerText()
check('invite code created', /Invite code [A-Z2-9]{8} created/.test(inviteMsg))
console.log(`         ${inviteMsg}`)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('section[aria-label="Audit log"]', { timeout: 15000 })
const auditRows = await page.locator('section[aria-label="Audit log"] tbody tr').count()
check('audit log recorded actions', auditRows >= 2)
await page.screenshot({ path: 'smoke-admin.png', fullPage: false })

// --- Buy now open (flag applied without deploy) ---
await page.goto(`${base}/buy`, { waitUntil: 'domcontentloaded' })
check('closed notice gone after flag on', (await page.locator('.notice-warn').count()) === 0)

console.log(`\nconsole errors: ${errors.length}`)
for (const e of errors.slice(0, 10)) console.log(`  ${e}`)
if (errors.length) process.exitCode = 1

await browser.close()

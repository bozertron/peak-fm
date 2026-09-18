/**
 * Seed REFERENCE data only.
 *
 * Markets, categories and feature flags are real configuration that the
 * product needs in order to function — a listing cannot exist without a market
 * to belong to. They are seeded here, idempotently, keyed on natural slugs.
 *
 * What this script deliberately does NOT seed is sample listings, sample
 * people or sample messages. Rule 3 of `tickets/doctrine/PROHIBITED.txt`
 * forbids hardcoded fake data standing in for a feature, and the old
 * `app/page.tsx` demo arrays were exactly that. An empty Buy page that
 * honestly says there is nothing for sale in Big White yet is correct. A Buy
 * page full of invented telehandlers is a lie that hides whether the query
 * layer works.
 *
 *   pnpm db:seed
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createJiti } from 'jiti'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { pool } = await jiti.import(resolve(root, 'lib/db/index.ts'))

/** Okanagan markets. Big White is the target market and ships active. */
const MARKETS = [
  { slug: 'big-white', name: 'Big White', region: 'Okanagan', lat: 49.7254, lng: -118.9376, radiusKm: 25, active: true },
  { slug: 'kelowna', name: 'Kelowna', region: 'Okanagan', lat: 49.888, lng: -119.496, radiusKm: 35, active: false },
  { slug: 'vernon', name: 'Vernon', region: 'Okanagan', lat: 50.267, lng: -119.272, radiusKm: 30, active: false },
  { slug: 'penticton', name: 'Penticton', region: 'Okanagan', lat: 49.4991, lng: -119.5937, radiusKm: 30, active: false },
  { slug: 'lake-country', name: 'Lake Country', region: 'Okanagan', lat: 50.0466, lng: -119.4036, radiusKm: 25, active: false },
]

const ALL = ['sale', 'rental', 'trade']
const CATEGORIES = [
  { slug: 'mountain-sports', name: 'Mountain Sports', appliesTo: ALL, position: 1 },
  { slug: 'tools-equipment', name: 'Tools & Equipment', appliesTo: ALL, position: 2 },
  { slug: 'home-garden', name: 'Home & Garden', appliesTo: ALL, position: 3 },
  { slug: 'vehicles-trailers', name: 'Vehicles & Trailers', appliesTo: ALL, position: 4 },
  { slug: 'trades-services', name: 'Trades & Services', appliesTo: ['sale'], position: 5 },
  { slug: 'home-services', name: 'Home Services', appliesTo: ['sale'], position: 6 },
  { slug: 'lessons-guiding', name: 'Lessons & Guiding', appliesTo: ['sale'], position: 7 },
  { slug: 'furniture', name: 'Furniture', appliesTo: ALL, position: 8 },
  { slug: 'electronics', name: 'Electronics', appliesTo: ALL, position: 9 },
  { slug: 'seasonal-storage', name: 'Seasonal & Storage', appliesTo: ['rental'], position: 10 },
]

/**
 * Kill switches. Every surface that is not finished ships disabled, so a beta
 * tester never walks into a half-built screen and the operator can open one
 * surface at a time without a deploy.
 */
const FLAGS = [
  { key: 'surface.buy', description: 'Buy — browse, filter, question sets, purchase', enabled: false },
  { key: 'surface.sell', description: 'Sell — presentation builder, service widgets', enabled: false },
  { key: 'surface.rent', description: 'Rent — listings, ROI explorer, auto-pay contracts', enabled: false },
  { key: 'surface.trade', description: 'Trade — offers, Bid as Sale, counters', enabled: false },
  { key: 'surface.find', description: 'Find — permanent demand capture and matchmaking', enabled: false },
  { key: 'surface.plans', description: 'Plans — personal, business, community', enabled: false },
  { key: 'surface.communicate', description: 'Communicate — threads, bulletin, in-chat commerce', enabled: false },
  { key: 'commerce.checkout', description: 'In-chat checkout through the payment provider', enabled: false },
  { key: 'commerce.autopay', description: 'Recurring auto-pay collection for rentals', enabled: false },
  { key: 'accounting.package', description: 'Accounting Package generation and download', enabled: false },
  { key: 'llm.widget_creator', description: 'LLM-assisted Product Widget Creator', enabled: false },
  { key: 'beta.invite_only', description: 'Require a beta invite code to register', enabled: true },
]

let markets = 0
let categories = 0
let flags = 0

for (const m of MARKETS) {
  const { rowCount } = await pool.query(
    `INSERT INTO "market" ("id","slug","name","region","centerLat","centerLng","radiusKm","active")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT ("slug") DO NOTHING`,
    [crypto.randomUUID(), m.slug, m.name, m.region, m.lat, m.lng, m.radiusKm, m.active],
  )
  markets += rowCount
}

for (const c of CATEGORIES) {
  const { rowCount } = await pool.query(
    `INSERT INTO "category" ("id","slug","name","appliesTo","position")
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT ("slug") DO NOTHING`,
    [crypto.randomUUID(), c.slug, c.name, c.appliesTo, c.position],
  )
  categories += rowCount
}

for (const f of FLAGS) {
  const { rowCount } = await pool.query(
    `INSERT INTO "feature_flag" ("key","description","enabled")
     VALUES ($1,$2,$3)
     ON CONFLICT ("key") DO NOTHING`,
    [f.key, f.description, f.enabled],
  )
  flags += rowCount
}

console.log(`Seeded reference data:`)
console.log(`    markets     ${markets} inserted, ${MARKETS.length - markets} already present`)
console.log(`    categories  ${categories} inserted, ${CATEGORIES.length - categories} already present`)
console.log(`    flags       ${flags} inserted, ${FLAGS.length - flags} already present`)
console.log(`\nNo sample listings were created. That is deliberate — see the header.`)

await pool.end()

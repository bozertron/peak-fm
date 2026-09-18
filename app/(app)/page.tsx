import Link from 'next/link'
import { getCurrentMarket, getFeatureFlags, countRows } from '@/lib/queries/market'
import { countListingsByKind } from '@/lib/queries/listings'

/**
 * The Pitch.
 *
 * This page answers one question: why would anyone download yet another
 * communications or marketplace app? The answer is not "we have listings" —
 * everyone has listings. It is that the seven verbs in the header are the
 * whole of local commerce, they share one contact list, and the paperwork
 * comes out the other end.
 *
 * Numbers on this page are real counts from the database. If the market is
 * empty it says so. A pitch built on invented inventory is a pitch that
 * breaks the first time someone taps it.
 */

const PITCHES = [
  {
    href: '/buy',
    label: 'Buy',
    flag: 'surface.buy',
    line: 'Everything for sale nearby, and filters sharp enough to actually find it.',
    body: 'Browse by category the way you browse anything else you enjoy. Then narrow it until only the things you would genuinely buy are left. Ask the seller your own questions before you commit — and when you are ready, the purchase happens inside the conversation.',
    proof: 'Buy History exports an accounting package: what it was, what it was for, what it cost, the tax split, and researched write-off potential.',
  },
  {
    href: '/sell',
    label: 'Sell',
    flag: 'surface.sell',
    line: 'Goods or a service, presented properly — from your phone, in one sitting.',
    body: 'Build a real product presentation with a file picker or the camera, shooting straight into the listing. Selling a service? The Product Widget Creator drafts your overview, pricing and booking tool so a neighbour can book your Saturday without a single message.',
    proof: 'The same accounting package, contextualised for sales rather than purchases.',
  },
  {
    href: '/rent',
    label: 'Rent',
    flag: 'surface.rent',
    line: 'Find out whether renting it out is worth doing — before you list it.',
    body: 'Explore ROI first: what it cost you, what local demand has actually been, what rate recoups it and how fast. Decide your conditions with the numbers in front of you. Then export the whole thing straight into a listing with only a review step in between.',
    proof: 'Auto-pay contracts collect on schedule, so you are not chasing anyone for rent.',
  },
  {
    href: '/trade',
    label: 'Trade',
    flag: 'surface.trade',
    line: 'Put it up, and let people surprise you with what they offer.',
    body: 'Trade works like the rest of the market, with one addition. Turn on Bid as Sale and anyone may offer an item, an amount of money, or both — whatever they think is fair. You accept, you counter, or you remove that person from your listing entirely.',
    proof: 'Bid as Sale is set once at creation. It is not a field a bidder can argue with.',
  },
  {
    href: '/find',
    label: 'Find',
    flag: 'surface.find',
    line: 'Say what you need once. It stays said until it is handled.',
    body: 'There is a Find button wherever it makes sense. Press it and Peak records what you were looking at when you needed something, then plays matchmaker between you and the people who can supply it.',
    proof: 'A Find stays a Find. It never turns into a listing, because your needs are not other people’s inventory.',
  },
  {
    href: '/plans',
    label: 'Plans',
    flag: 'surface.plans',
    line: 'Personal projects, professional offers, and what the town is deciding.',
    body: 'Plan your bathroom reno privately. A plumber who saw your Find can answer with their own plan — scoped, priced, timelined and guaranteed. Community carries local events and the announcements that are asking for your feedback.',
    proof: 'One shape for all three, which is how a homeowner’s plan and a tradesperson’s quote meet in the middle.',
  },
  {
    href: '/communicate',
    label: 'Communicate',
    flag: 'surface.communicate',
    line: 'Every conversation, on every topic, in one place you can actually clear.',
    body: 'Buying, selling, renting, trading, finding and planning all end up as conversations. They land here together, attached to the thing they are about, easy to archive, easy to delete, and easy to act on without going anywhere else.',
    proof: 'Because commerce runs inside the thread, the receipt and the conversation never drift apart.',
  },
] as const

function Numeral({ value, label }: { value: number; label: string }) {
  return (
    <div className="pitch-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export default async function LandingPage() {
  const market = await getCurrentMarket()
  const flags = await getFeatureFlags()

  const [byKind, members, finds, plans] = await Promise.all([
    market ? countListingsByKind(market.id) : Promise.resolve({ sale: 0, rental: 0, trade: 0 }),
    countRows('user'),
    countRows('find_request'),
    countRows('plan'),
  ])

  return (
    <main>
      <section className="pitch-hero">
        <p className="eyebrow-text">
          {market ? `${market.name.toUpperCase()}, ${market.region.toUpperCase()}` : 'NO MARKET OPEN YET'}
        </p>
        <h1>
          Your town already trades with itself.
          <br />
          <em>This is where it happens.</em>
        </h1>
        <p className="pitch-lede">
          Peak is one local market with seven things you can do in it — buy, sell, rent, trade,
          find, plan and talk. Same neighbours, same contact list, same thread. The difference is
          that when the deal is done, you get the paperwork instead of a screenshot.
        </p>

        <div className="pitch-actions">
          <Link href="/buy" className="primary-button">
            See what is for sale
          </Link>
          <Link href="/sell" className="ghost-button">
            List something
          </Link>
        </div>

        {market ? (
          <div className="pitch-stats">
            <Numeral value={byKind.sale} label="for sale" />
            <Numeral value={byKind.rental} label="for rent" />
            <Numeral value={byKind.trade} label="up for trade" />
            <Numeral value={finds} label="things wanted" />
            <Numeral value={plans} label="plans underway" />
            <Numeral value={members} label="members" />
          </div>
        ) : (
          <p className="notice notice-warn">
            No market is active. Run <code>pnpm db:seed</code> to open Big White.
          </p>
        )}
      </section>

      <section className="pitch-grid-section">
        <div className="section-heading">
          <div>
            <h2>Seven verbs, one market</h2>
            <p>The header is the product. Each one is an intent, not a menu.</p>
          </div>
        </div>

        <div className="pitch-grid">
          {PITCHES.map((pitch) => {
            const live = flags.get(pitch.flag)?.enabled ?? false
            return (
              <article className="pitch-card" key={pitch.href}>
                <div className="pitch-card-head">
                  <h3>{pitch.label}</h3>
                  <span className={live ? 'status-chip status-live' : 'status-chip status-building'}>
                    {live ? 'Open' : 'In build'}
                  </span>
                </div>
                <p className="pitch-line">{pitch.line}</p>
                <p className="pitch-body">{pitch.body}</p>
                <p className="pitch-proof">{pitch.proof}</p>
                <Link href={pitch.href} className="text-link">
                  Go to {pitch.label} →
                </Link>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import { listListings } from '@/lib/queries/listings'
import { listOffersForOwner } from '@/lib/queries/trade'
import { ClosedNotice, EmptyState, ListingGrid, SurfaceHeading, money } from '@/components/surface'

/**
 * Trade — the market spine plus Bid as Sale.
 *
 * Bid as Sale is set once when the listing is created and is not negotiable
 * afterwards. With it on, a bidder may offer an item, an amount of money, or
 * both. The owner accepts, counters, or removes visibility from that person.
 */
export default async function TradePage() {
  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.trade'),
  ])

  if (!market) {
    return (
      <main className="page-section">
        <SurfaceHeading eyebrow="TRADE" title="No market is open" lede="Trade needs an active market." />
        <EmptyState title="No active market" body="Run pnpm db:seed to open Big White." />
      </main>
    )
  }

  const [listings, incoming] = await Promise.all([
    listListings({ marketId: market.id, kind: 'trade', viewerId: session?.user?.id }),
    session?.user ? listOffersForOwner(session.user.id) : Promise.resolve([]),
  ])

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`TRADE · ${market.name.toUpperCase()}`}
        title={
          <>
            Put it up. See what <em>comes back</em>
          </>
        }
        lede="Trade works like the rest of the market, with one addition: turn on Bid as Sale and people may offer whatever they think is fair."
        action={
          <Link href="/trade/create" className="primary-button">
            List something for trade
          </Link>
        }
      />

      {!open && <ClosedNotice label="Trade" />}

      {session?.user && (
        <section className="offers-section" aria-label="Offers on your listings">
          <div className="section-heading">
            <div>
              <h2>Offers on your listings</h2>
              <p>Accept, counter, or remove that person from the listing.</p>
            </div>
          </div>
          {incoming.length > 0 ? (
            <div className="offer-list">
              {incoming.map((offer) => (
                <article className="offer-row" key={offer.id}>
                  <div className="offer-main">
                    <strong>{offer.listingTitle}</strong>
                    <span>
                      {offer.offererName} offered{' '}
                      {offer.offerKind === 'cash'
                        ? money(offer.cashCents, offer.currency)
                        : offer.offerKind === 'mixed'
                          ? `${offer.offeredDescription ?? 'an item'} + ${money(offer.cashCents, offer.currency)}`
                          : (offer.offeredDescription ?? 'an item')}
                    </span>
                    {offer.message && <p className="offer-message">{offer.message}</p>}
                  </div>
                  <div className="offer-actions">
                    <span className={`status-chip status-${offer.status}`}>{offer.status}</span>
                    <Link href={`/trade/offer/${offer.id}`} className="text-link">
                      Respond →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-note">No open offers on your trade listings.</p>
          )}
        </section>
      )}

      <div className="section-heading">
        <div>
          <h2>Up for trade in {market.name}</h2>
          <p>Listings where someone is open to a swap.</p>
        </div>
      </div>

      {listings.length > 0 ? (
        <ListingGrid listings={listings} />
      ) : (
        <EmptyState
          title={`Nothing up for trade in ${market.name} yet`}
          body="Trade is the surface most likely to surprise you — but only once somebody goes first."
          action={
            <Link href="/trade/create" className="primary-button">
              List something for trade
            </Link>
          }
        />
      )}
    </main>
  )
}

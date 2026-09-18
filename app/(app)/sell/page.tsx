import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import { listSellerListings, sellerTotals } from '@/lib/queries/sell'
import {
  ClosedNotice,
  EmptyState,
  SignedOutNotice,
  SurfaceHeading,
  money,
} from '@/components/surface'

/**
 * Sell — the seller's own desk.
 *
 * Buy and Sell are two views of the same `kind: 'sale'` row. This is the one
 * the seller sees: their drafts, what is live, what sold, and the accounting
 * package that comes out the other end.
 */
export default async function SellPage() {
  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.sell'),
  ])

  if (!session?.user) {
    return (
      <main className="page-section">
        <SurfaceHeading
          eyebrow="SELL"
          title={
            <>
              Sell goods, or <em>sell your time</em>
            </>
          }
          lede="Build a real presentation from your phone — file picker or camera, straight into the listing."
        />
        <SignedOutNotice what="Your listings and sales history" />
      </main>
    )
  }

  const [listings, totals] = await Promise.all([
    listSellerListings(session.user.id),
    sellerTotals(session.user.id),
  ])

  const drafts = listings.filter((l) => l.status === 'draft')
  const live = listings.filter((l) => l.status === 'active')
  const done = listings.filter((l) => l.status === 'completed')

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`SELL · ${market?.name.toUpperCase() ?? 'NO MARKET'}`}
        title={
          <>
            Sell goods, or <em>sell your time</em>
          </>
        }
        lede="Build a real presentation from your phone — file picker or camera, straight into the listing."
        action={
          <div className="empty-actions">
            <Link href="/sell/new?type=goods" className="primary-button">
              Sell a product
            </Link>
            <Link href="/sell/new?type=service" className="ghost-button">
              Sell a service
            </Link>
          </div>
        }
      />

      {!open && <ClosedNotice label="Sell" />}

      <div className="stat-row">
        <div className="stat-tile">
          <strong>{live.length}</strong>
          <span>live listings</span>
        </div>
        <div className="stat-tile">
          <strong>{drafts.length}</strong>
          <span>drafts</span>
        </div>
        <div className="stat-tile">
          <strong>{totals.orderCount}</strong>
          <span>sales</span>
        </div>
        <div className="stat-tile">
          <strong>{money(totals.grossCents)}</strong>
          <span>gross</span>
        </div>
      </div>

      <div className="notice notice-info">
        <strong>Service listings need a Product Widget.</strong>
        <span>
          A service overview, pricing tiers and a booking tool render at the top of the listing, so
          a neighbour can book you without sending a single message. The LLM-assisted creator
          drafts it; you keep editorial control and the draft is always attributed.
        </span>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          title="You have not listed anything yet"
          body="Start with a product or a service. Photos can come straight from your camera on a phone."
          action={
            <Link href="/sell/new?type=goods" className="primary-button">
              Build your first listing
            </Link>
          }
        />
      ) : (
        <section aria-label="Your listings">
          <div className="section-heading">
            <div>
              <h2>Your listings</h2>
              <p>Drafts stay private until you publish them.</p>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Price</th>
                <th scope="col">Photos</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {listings.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.title}</th>
                  <td>{row.offeringType === 'service' ? 'Service' : 'Goods'}</td>
                  <td>
                    <span className={`status-chip status-${row.status}`}>{row.status}</span>
                  </td>
                  <td>
                    {money(row.priceCents, row.currency)}
                    {row.pricingUnit && <small> / {row.pricingUnit}</small>}
                  </td>
                  <td>{row.mediaCount}</td>
                  <td>
                    <Link href={`/sell/${row.id}`} className="text-link">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {done.length > 0 && (
        <section aria-label="Sales history">
          <div className="section-heading">
            <div>
              <h2>Sell History</h2>
              <p>Download an accounting package for any completed sale.</p>
            </div>
            <Link href="/account/history?perspective=seller" className="ghost-button">
              Open Sell History →
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}

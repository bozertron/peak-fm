import Link from 'next/link'
import './rent.css'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import { listListings } from '@/lib/queries/listings'
import { listRoiModels } from '@/lib/queries/rent'
import { ClosedNotice, EmptyState, ListingGrid, SurfaceHeading, money } from '@/components/surface'

/**
 * Rent — browse rentals, and the three creation paths.
 *
 * The three options are deliberately equals rather than a wizard: an owner who
 * does not yet know whether renting the thing out is worth doing should land
 * in Explore ROI, not be pushed through Build Rental first and asked to guess
 * a price at the end.
 */
export default async function RentPage() {
  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.rent'),
  ])

  if (!market) {
    return (
      <main className="page-section">
        <SurfaceHeading eyebrow="RENT" title="No market is open" lede="Rent needs an active market." />
        <EmptyState title="No active market" body="Run pnpm db:seed to open Big White." />
      </main>
    )
  }

  const [listings, roiModels] = await Promise.all([
    listListings({ marketId: market.id, kind: 'rental', viewerId: session?.user?.id }),
    session?.user ? listRoiModels(session.user.id) : Promise.resolve([]),
  ])

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`RENT · ${market.name.toUpperCase()}`}
        title={
          <>
            Rent it, or <em>rent it out</em>
          </>
        }
        lede="See what is available locally — and work out whether the thing in your garage is worth listing."
      />

      {!open && <ClosedNotice label="Rent" />}

      <section className="option-row" aria-label="Create a rental">
        <article className="option-card">
          <span className="option-number">1</span>
          <h3>Build Rental</h3>
          <p>Photos, conditions, rate and availability. The direct route when you already know your price.</p>
          <Link href="/rent/build" className="text-link">
            Build a rental →
          </Link>
        </article>
        <article className="option-card option-card-accent">
          <span className="option-number">2</span>
          <h3>Explore ROI</h3>
          <p>
            What it cost, what local demand has actually been, what rate recoups it and how fast.
            Decide whether to do it at all — then export straight into Build Rental with only a
            review step in between.
          </p>
          <Link href="/rent/roi" className="text-link">
            Explore the numbers →
          </Link>
        </article>
        <article className="option-card">
          <span className="option-number">3</span>
          <h3>Auto-Pay Contract</h3>
          <p>Recurring collection on a schedule both sides accepted, through the payment provider.</p>
          <Link href="/rent/autopay" className="text-link">
            Set up auto-pay →
          </Link>
        </article>
      </section>

      {roiModels.length > 0 && (
        <section className="roi-strip" aria-label="Your ROI explorations">
          <div className="section-heading">
            <div>
              <h2>Your ROI explorations</h2>
              <p>Unfinished models are kept until you export or delete them.</p>
            </div>
          </div>
          <div className="roi-list">
            {roiModels.map((model) => (
              <article className="roi-row" key={model.id}>
                <div>
                  <strong>{model.assetName}</strong>
                  <span>
                    {money(model.acquisitionCostCents)} acquired
                    {model.breakEvenMonths !== null && ` · breaks even in ${model.breakEvenMonths} mo`}
                  </span>
                </div>
                <div className="roi-row-right">
                  {model.suggestedRateCents !== null && (
                    <strong>
                      {money(model.suggestedRateCents)} <small>/ {model.suggestedUnit}</small>
                    </strong>
                  )}
                  <Link href={`/rent/roi/${model.id}`} className="text-link">
                    {model.exportedAt ? 'View' : 'Continue'} →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="section-heading">
        <div>
          <h2>Available in {market.name}</h2>
          <p>Rentals from people nearby.</p>
        </div>
      </div>

      {listings.length > 0 ? (
        <ListingGrid listings={listings} />
      ) : (
        <EmptyState
          title={`Nothing for rent in ${market.name} yet`}
          body="An empty market, honestly reported. Explore ROI to find out whether you should be the first."
          action={
            <Link href="/rent/roi" className="primary-button">
              Explore ROI
            </Link>
          }
        />
      )}
    </main>
  )
}

import Link from 'next/link'
import { AccountGraphic } from '@/components/account-graphic'
import type { ListingCard } from '@/lib/queries/listings'

export function SurfaceHeading({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow: string
  title: React.ReactNode
  lede: string
  action?: React.ReactNode
}) {
  return (
    <div className="surface-heading">
      <div>
        <p className="eyebrow-text">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>
      {action && <div className="surface-action">{action}</div>}
    </div>
  )
}

/**
 * Shown when a surface is switched off in `feature_flag`.
 *
 * This is a real state with a real cause, not a placeholder: an operator
 * turned the surface off, and the page says so plainly instead of pretending
 * the data is still loading.
 */
export function ClosedNotice({ label }: { label: string }) {
  return (
    <div className="notice notice-warn">
      <strong>{label} is not open yet.</strong>
      <span>
        The data below is live, but the operator has this surface switched off for members. An
        admin can open it under Feature flags in the <Link href="/admin">admin dashboard</Link>.
      </span>
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function SignedOutNotice({ what }: { what: string }) {
  return (
    <EmptyState
      title="Sign in to continue"
      body={`${what} belongs to your account, so there is nothing to show until you sign in.`}
      action={
        <Link href="/sign-in" className="primary-button">
          Sign in
        </Link>
      }
    />
  )
}

export function money(cents: number | null, currency = 'CAD'): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export function ListingGrid({ listings }: { listings: ListingCard[] }) {
  return (
    <div className="listing-grid">
      {listings.map((item) => (
        <article className="listing-card" key={item.id}>
          <Link href={`/listing/${item.id}`} className="listing-card-link">
            <div className="listing-card-image">
              {item.imageUrl ? (
                // Images are user-uploaded and already sized on upload;
                // next.config sets `images.unoptimized`, so a plain img is
                // what next/image would render anyway.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.title} loading="lazy" />
              ) : (
                <div className="listing-card-noimage" aria-hidden="true">
                  <span>No photo yet</span>
                </div>
              )}
              {item.bidAsSale && <span className="listing-flag">Bid as Sale</span>}
            </div>
            <div className="listing-card-body">
              <div className="wood-rule" />
              {item.categoryName && <span className="card-category">{item.categoryName}</span>}
              <h3>{item.title}</h3>
              {item.summary && <p className="listing-card-summary">{item.summary}</p>}
              <div className="listing-card-meta">
                <span className="owner-inline">
                  <AccountGraphic
                    name={item.sellerName}
                    kind={item.sellerAvatarKind}
                    seed={item.sellerAvatarSeed}
                    size={22}
                  />
                  {item.sellerName}
                </span>
                <strong>
                  {money(item.priceCents, item.currency)}
                  {item.pricingUnit && <small> / {item.pricingUnit}</small>}
                </strong>
              </div>
              {item.locationName && <p className="listing-card-location">{item.locationName}</p>}
            </div>
          </Link>
        </article>
      ))}
    </div>
  )
}

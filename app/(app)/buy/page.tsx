import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, getCategories, isEnabled } from '@/lib/queries/market'
import { listListings } from '@/lib/queries/listings'
import { ClosedNotice, EmptyState, ListingGrid, SurfaceHeading } from '@/components/surface'

/**
 * Buy — browse local supply with filters sharp enough to be worth using.
 *
 * Filters live in the URL, not in component state. That makes a filtered view
 * shareable, back-button-correct, and server-rendered: the database does the
 * narrowing, so a large market never ships its whole catalogue to the browser.
 */
export default async function BuyPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const [session, market, categories, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(one('market')),
    getCategories('sale'),
    isEnabled('surface.buy'),
  ])

  if (!market) {
    return (
      <main className="page-section">
        <SurfaceHeading
          eyebrow="BUY"
          title="No market is open"
          lede="Buy needs an active market before it can show anything."
        />
        <EmptyState
          title="No active market"
          body="Run pnpm db:seed to open Big White, or activate a market from the admin dashboard."
        />
      </main>
    )
  }

  const categorySlug = one('category')
  const q = one('q')
  const sort = (one('sort') ?? 'newest') as 'newest' | 'price-asc' | 'price-desc'
  const offeringType = one('type') as 'goods' | 'service' | undefined
  const minCents = one('min') ? Number(one('min')) * 100 : undefined
  const maxCents = one('max') ? Number(one('max')) * 100 : undefined

  const listings = await listListings({
    marketId: market.id,
    kind: 'sale',
    categorySlug,
    q,
    sort,
    offeringType,
    minCents: Number.isFinite(minCents) ? minCents : undefined,
    maxCents: Number.isFinite(maxCents) ? maxCents : undefined,
    viewerId: session?.user?.id,
  })

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ category: categorySlug, q, sort, type: offeringType, ...patch })) {
      if (v) next.set(k, v)
    }
    const qs = next.toString()
    return qs ? `/buy?${qs}` : '/buy'
  }

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`BUY · ${market.name.toUpperCase()}`}
        title={
          <>
            What is for sale <em>near you</em>
          </>
        }
        lede="Browse by category, then narrow it until only the things you would actually buy are left."
        action={
          <Link href="/find" className="ghost-button">
            Cannot find it? Raise a Find →
          </Link>
        }
      />

      {!open && <ClosedNotice label="Buy" />}

      <form className="filter-bar" action="/buy" method="get">
        {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
        <div className="search-box">
          <input name="q" defaultValue={q ?? ''} placeholder={`Search ${market.name}`} aria-label="Search listings" />
        </div>
        <label className="filter-field">
          <span>Type</span>
          <select name="type" defaultValue={offeringType ?? ''}>
            <option value="">Anything</option>
            <option value="goods">Goods</option>
            <option value="service">Services</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Min $</span>
          <input name="min" type="number" min="0" defaultValue={one('min') ?? ''} />
        </label>
        <label className="filter-field">
          <span>Max $</span>
          <input name="max" type="number" min="0" defaultValue={one('max') ?? ''} />
        </label>
        <label className="filter-field">
          <span>Sort</span>
          <select name="sort" defaultValue={sort}>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <button type="submit" className="primary-button">
          Apply
        </button>
      </form>

      <nav className="category-rail" aria-label="Categories">
        <Link className={`filter-tab ${!categorySlug ? 'selected' : ''}`} href={href({ category: undefined })}>
          All
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            className={`filter-tab ${categorySlug === cat.slug ? 'selected' : ''}`}
            href={href({ category: cat.slug })}
          >
            {cat.name}
          </Link>
        ))}
      </nav>

      {listings.length > 0 ? (
        <>
          <p className="result-count">
            {listings.length} listing{listings.length === 1 ? '' : 's'} in {market.name}
          </p>
          <ListingGrid listings={listings} />
        </>
      ) : (
        <EmptyState
          title={`Nothing for sale in ${market.name} yet`}
          body="This is a real, empty market — not a loading state. The first listing anyone posts will show up here."
          action={
            <div className="empty-actions">
              <Link href="/sell" className="primary-button">
                Be the first to sell
              </Link>
              <Link href="/find" className="ghost-button">
                Tell people what you need
              </Link>
            </div>
          }
        />
      )}
    </main>
  )
}

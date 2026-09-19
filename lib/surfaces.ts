/**
 * The seven verbs in the header, in their fixed order.
 *
 * Plain data in its own module so BOTH server and client components can read
 * it. It previously lived in `components/peak-header.tsx`, which carries
 * `'use client'` — importing it from a Server Component yielded a client
 * reference proxy rather than the array, and prerendering the 404 page failed
 * with `SURFACES.map is not a function`.
 *
 * The order is specified by the product and is not cosmetic: each entry is one
 * intent, which is why Find sits beside Buy rather than inside it.
 */
export const SURFACES = [
  { href: '/buy', label: 'Buy', flag: 'surface.buy' },
  { href: '/sell', label: 'Sell', flag: 'surface.sell' },
  { href: '/rent', label: 'Rent', flag: 'surface.rent' },
  { href: '/trade', label: 'Trade', flag: 'surface.trade' },
  { href: '/find', label: 'Find', flag: 'surface.find' },
  { href: '/plans', label: 'Plans', flag: 'surface.plans' },
  { href: '/communicate', label: 'Communicate', flag: 'surface.communicate' },
] as const

export type Surface = (typeof SURFACES)[number]

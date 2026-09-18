/**
 * The user-applied interactive graphic in the Account control.
 *
 * Two renderers, selected by `user.avatarKind`:
 *   'initials' — the letterform mark, the default
 *   'ridge'    — a mountain ridge generated deterministically from the seed
 *
 * Both are pure functions of (kind, seed, name), so the same user draws
 * identically on every device and on the server during SSR. No randomness, no
 * network request, no image host.
 */

/** FNV-1a. Small, stable, and does not vary between runtimes. */
function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic 0..1 sequence from a seed. */
function sequence(seed: string, count: number): number[] {
  let state = hash(seed) || 1
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    out.push(state / 0xffffffff)
  }
  return out
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const PALETTE = ['#244b3a', '#a56b43', '#743f3f', '#334653', '#5d6b4a', '#7a5c2e']

export function AccountGraphic({
  name,
  kind = 'initials',
  seed,
  size = 32,
}: {
  name: string
  kind?: string
  seed?: string | null
  size?: number
}) {
  const key = seed || name || 'peak'
  const colour = PALETTE[hash(key) % PALETTE.length]

  if (kind === 'ridge') {
    // Six ridge heights across the tile, back range lighter than the front.
    const r = sequence(key, 8)
    const front = r.slice(0, 5).map((v, i) => `${i * 25},${100 - (26 + v * 44)}`)
    const back = r.slice(3, 8).map((v, i) => `${i * 25},${100 - (40 + v * 46)}`)
    return (
      <svg
        className="account-graphic"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${name} profile mark`}
      >
        <rect width="100" height="100" rx="50" fill={colour} opacity="0.16" />
        <polygon points={`0,100 ${back.join(' ')} 100,100`} fill={colour} opacity="0.4" />
        <polygon points={`0,100 ${front.join(' ')} 100,100`} fill={colour} />
      </svg>
    )
  }

  return (
    <span
      className="account-graphic account-graphic-initials"
      style={{ width: size, height: size, background: colour, fontSize: size * 0.36 }}
      aria-label={`${name} profile mark`}
      role="img"
    >
      {initialsOf(name)}
    </span>
  )
}

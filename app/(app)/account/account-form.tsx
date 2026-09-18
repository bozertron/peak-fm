'use client'

import { useState, useTransition } from 'react'
import { AccountGraphic } from '@/components/account-graphic'
import { updateProfile } from './actions'

type Market = { id: string; name: string; region: string; active: boolean }

/**
 * Account settings, including the user-applied interactive graphic.
 *
 * The preview updates live as the user types a seed or switches renderer, so
 * "interactive" means they can actually see what they are choosing before they
 * save it — not a file upload dialog and a hope.
 */
export function AccountForm({
  initial,
  markets,
}: {
  initial: { name: string; email: string; avatarKind: string; avatarSeed: string | null; marketId: string | null }
  markets: Market[]
}) {
  const [name, setName] = useState(initial.name)
  const [avatarKind, setAvatarKind] = useState(initial.avatarKind)
  const [avatarSeed, setAvatarSeed] = useState(initial.avatarSeed ?? '')
  const [marketId, setMarketId] = useState(initial.marketId ?? '')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const result = await updateProfile(formData)
      setMessage(
        result.ok
          ? { kind: 'ok', text: 'Saved.' }
          : { kind: 'error', text: result.error },
      )
    })
  }

  return (
    <form className="account-form" onSubmit={onSubmit}>
      <div className="account-graphic-picker">
        <div className="account-graphic-preview">
          <AccountGraphic name={name || initial.name} kind={avatarKind} seed={avatarSeed || null} size={96} />
          <span className="muted-note">Live preview</span>
        </div>

        <fieldset className="graphic-options">
          <legend>Your profile graphic</legend>
          {[
            { value: 'initials', label: 'Initials', hint: 'Your letters on a colour drawn from your name.' },
            { value: 'ridge', label: 'Ridge', hint: 'A mountain ridge generated from your seed. Same seed, same ridge, every device.' },
          ].map((option) => (
            <label key={option.value} className="graphic-option">
              <input
                type="radio"
                name="avatarKind"
                value={option.value}
                checked={avatarKind === option.value}
                onChange={() => setAvatarKind(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
          <label className="field">
            <span>Seed</span>
            <input
              name="avatarSeed"
              value={avatarSeed}
              onChange={(e) => setAvatarSeed(e.target.value)}
              maxLength={64}
              placeholder="Anything — change it until you like the result"
            />
          </label>
        </fieldset>
      </div>

      <label className="field">
        <span>Display name</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
      </label>

      <label className="field">
        <span>Email</span>
        <input value={initial.email} readOnly aria-describedby="email-note" />
        <small id="email-note" className="muted-note">
          Email changes go through verification and are not editable here yet.
        </small>
      </label>

      <label className="field">
        <span>Home market</span>
        <select name="marketId" value={marketId} onChange={(e) => setMarketId(e.target.value)}>
          <option value="">No market selected</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.active}>
              {m.name}, {m.region}
              {m.active ? '' : ' — not open yet'}
            </option>
          ))}
        </select>
      </label>

      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {message && (
          <span className={message.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">
            {message.text}
          </span>
        )}
      </div>
    </form>
  )
}

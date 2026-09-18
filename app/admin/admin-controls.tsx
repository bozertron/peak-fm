'use client'

import { useState, useTransition } from 'react'
import { toggleFlag, setMarketActive, createInvite, revokeInvite, changeRole, resolveReport } from './actions'
import type { AdminResult } from './actions'

/** Shared result banner so every control reports what actually happened. */
function useAction() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<AdminResult | null>(null)
  const run = (fn: () => Promise<AdminResult>) =>
    startTransition(async () => setResult(await fn()))
  return { pending, result, run }
}

function Banner({ result }: { result: AdminResult | null }) {
  if (!result) return null
  return (
    <span className={result.ok ? 'form-ok' : 'form-error'} role="status">
      {result.ok ? (result.message ?? 'Done.') : result.error}
    </span>
  )
}

export function FlagToggle({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  const { pending, result, run } = useAction()
  return (
    <div className="inline-control">
      <button
        type="button"
        className={enabled ? 'toggle toggle-on' : 'toggle toggle-off'}
        disabled={pending}
        aria-pressed={enabled}
        onClick={() => run(() => toggleFlag(flagKey, !enabled))}
      >
        {pending ? '…' : enabled ? 'On' : 'Off'}
      </button>
      <Banner result={result} />
    </div>
  )
}

export function MarketToggle({ marketId, active }: { marketId: string; active: boolean }) {
  const { pending, result, run } = useAction()
  return (
    <div className="inline-control">
      <button
        type="button"
        className={active ? 'toggle toggle-on' : 'toggle toggle-off'}
        disabled={pending}
        aria-pressed={active}
        onClick={() => run(() => setMarketActive(marketId, !active))}
      >
        {pending ? '…' : active ? 'Open' : 'Closed'}
      </button>
      <Banner result={result} />
    </div>
  )
}

export function RoleSelect({
  userId,
  role,
  roles,
}: {
  userId: string
  role: string
  roles: readonly string[]
}) {
  const { pending, result, run } = useAction()
  return (
    <div className="inline-control">
      <select
        defaultValue={role}
        disabled={pending}
        aria-label="Member role"
        onChange={(e) => run(() => changeRole(userId, e.target.value))}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Banner result={result} />
    </div>
  )
}

export function InviteForm() {
  const { pending, result, run } = useAction()
  return (
    <form
      className="invite-form"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        run(() => createInvite(formData))
      }}
    >
      <label className="field">
        <span>Email (optional)</span>
        <input name="email" type="email" placeholder="tester@example.com" />
      </label>
      <label className="field">
        <span>Note</span>
        <input name="note" placeholder="Who is this for?" />
      </label>
      <label className="field field-narrow">
        <span>Uses</span>
        <input name="maxRedemptions" type="number" min="1" max="100" defaultValue="1" />
      </label>
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? 'Creating…' : 'Create invite'}
      </button>
      <Banner result={result} />
    </form>
  )
}

export function RevokeInvite({ inviteId }: { inviteId: string }) {
  const { pending, result, run } = useAction()
  return (
    <div className="inline-control">
      <button
        type="button"
        className="ghost-button ghost-button-danger"
        disabled={pending}
        onClick={() => run(() => revokeInvite(inviteId))}
      >
        {pending ? '…' : 'Revoke'}
      </button>
      <Banner result={result} />
    </div>
  )
}

export function ResolveReport({ reportId }: { reportId: string }) {
  const { pending, result, run } = useAction()
  const [note, setNote] = useState('')
  return (
    <div className="resolve-control">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note"
        aria-label="Resolution note"
      />
      <button
        type="button"
        className="primary-button"
        disabled={pending}
        onClick={() => run(() => resolveReport(reportId, 'actioned', note))}
      >
        Action
      </button>
      <button
        type="button"
        className="ghost-button"
        disabled={pending}
        onClick={() => run(() => resolveReport(reportId, 'dismissed', note))}
      >
        Dismiss
      </button>
      <Banner result={result} />
    </div>
  )
}

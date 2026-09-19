import { headers } from 'next/headers'
import '../auth.css'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isEnabled } from '@/lib/queries/market'
import { AuthForm } from '@/components/auth-form'

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  // The page asks the same question the auth endpoint asks, so the form a visitor
  // sees matches what the server will do. This answer is presentation only — the
  // enforcement is in `lib/auth.ts`, on the sign-up path, because the endpoint is
  // publicly reachable and a guard that lives only in a page is not a guard.
  // `isEnabled` is the repo's single flag reader: an unknown key is OFF.
  const inviteRequired = await isEnabled('beta.invite_only')
  return <AuthForm mode="sign-up" inviteRequired={inviteRequired} />
}

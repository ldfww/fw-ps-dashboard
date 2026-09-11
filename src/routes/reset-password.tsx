import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getSupabaseClient } from '~/lib/auth'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => ({ code: (search.code as string) || '' }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { code } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!code) {
      getSupabaseClient().auth.getSession().then(({ data }) => {
        if (data.session) setReady(true)
        else setError('This password reset link is invalid or has expired.')
      })
      return
    }

    getSupabaseClient().auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) setError(exchangeError.message)
      else setReady(true)
    })
  }, [code])

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const { error: updateError } = await getSupabaseClient().auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    router.navigate({ to: '/', replace: true })
  }

  return (
    <div className="mx-auto max-w-sm border border-ink/10 bg-paper p-8 font-manrope">
      <h1 className="mb-2 font-sora text-2xl font-semibold text-ink">Reset password</h1>
      <p className="mb-6 text-sm text-muted">Enter a new password for your account.</p>
      {error && <p className="mb-4 border border-accent p-3 text-sm text-accent">{error}</p>}
      {ready && (
        <form onSubmit={updatePassword} className="space-y-4">
          <label className="block text-sm text-muted">
            New password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink" required minLength={8} />
          </label>
          <label className="block text-sm text-muted">
            Confirm password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink" required minLength={8} />
          </label>
          <button type="submit" disabled={saving} className="w-full border border-ink/10 bg-ink p-2 text-paper hover:bg-ink/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </div>
  )
}

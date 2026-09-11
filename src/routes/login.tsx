import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getSupabaseClient } from '~/lib/auth'

export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || '/',
  }),
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [resetting, setResetting] = useState(false)

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const { error: err } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    })
    if (err) {
      setError(err.message)
      return
    }
    router.navigate({ to: search.redirect, replace: true })
  }

  async function sendPasswordReset() {
    setError('')
    setMessage('')
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    const { error: err } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) {
      setError(err.message)
      return
    }
    setMessage('Check your email for a password reset link.')
    setResetting(false)
  }

  async function signInWithGoogle() {
    setError('')
    const { error: err } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (err) setError(err.message)
  }

  return (
    <div className="mx-auto max-w-sm border border-ink/10 bg-paper p-8 font-manrope">
      <h1 className="mb-6 font-sora text-2xl font-semibold text-ink">
        Sign in
      </h1>
      {error && (
        <p className="mb-4 border border-accent p-3 text-sm text-accent">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 border border-green-600 p-3 text-sm text-green-700">
          {message}
        </p>
      )}
      <form onSubmit={signInWithEmail} className="space-y-4">
        <div>
          <label className="block text-sm text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink"
            required
          />
        </div>
        {!resetting && (
          <div>
            <label className="block text-sm text-muted">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink"
              required
            />
          </div>
        )}
        {resetting ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={sendPasswordReset}
              className="w-full border border-ink/10 bg-ink p-2 text-paper hover:bg-ink/90"
            >
              Send reset link
            </button>
            <button type="button" onClick={() => setResetting(false)} className="w-full p-2 text-sm text-muted hover:text-ink">
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <button
              type="submit"
              className="w-full border border-ink/10 bg-ink p-2 text-paper hover:bg-ink/90"
            >
              Sign in with email
            </button>
            <button type="button" onClick={() => setResetting(true)} className="w-full text-sm text-muted hover:text-ink">
              Forgot your password?
            </button>
          </>
        )}
      </form>
      <div className="my-6 border-t border-ink/10" />
      <button
        type="button"
        onClick={signInWithGoogle}
        className="w-full border border-ink/10 p-2 text-ink hover:border-ink"
      >
        Sign in with Google
      </button>
    </div>
  )
}

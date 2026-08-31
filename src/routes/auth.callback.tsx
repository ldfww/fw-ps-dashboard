import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getSupabaseClient } from '~/lib/auth'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search) => ({
    code: (search.code as string) || '',
  }),
  component: CallbackPage,
})

function CallbackPage() {
  const search = Route.useSearch()
  const router = useRouter()
  const [message, setMessage] = useState('Completing sign-in…')

  useEffect(() => {
    if (!search.code) {
      setMessage('Missing OAuth code.')
      return
    }
    getSupabaseClient()
      .auth.exchangeCodeForSession(search.code)
      .then(({ error }) => {
        if (error) {
          setMessage(error.message)
        } else {
          router.navigate({ to: '/', replace: true })
        }
      })
      .catch((err) => setMessage(err.message || 'Could not complete sign-in'))
  }, [search.code, router])

  return (
    <div className="mx-auto max-w-sm border border-ink/10 bg-paper p-8 font-manrope text-ink">
      {message}
    </div>
  )
}

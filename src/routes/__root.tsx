import type { ReactNode } from 'react'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  redirect,
  Scripts,
  useRouter,
} from '@tanstack/react-router'
import { getSession } from '~/lib/auth-server'
import '~/styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Financial Warranty Ops Dashboard' },
    ],
    links: [
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Sora:wght@400;600;700&display=swap',
      },
    ],
  }),
  loader: async ({ location }) => {
    const path = location.pathname
    if (path.startsWith('/api/')) return null

    const session = await getSession()
    if (path === '/login' || path === '/auth/callback') {
      if (session) throw redirect({ to: '/', replace: true })
      return null
    }

    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
    }

    return session
  },
  component: RootComponent,
})

function RootComponent() {
  const session = Route.useLoaderData()
  const router = useRouter()

  async function signOut() {
    const { getSupabaseClient } = await import('~/lib/auth')
    await getSupabaseClient().auth.signOut()
    router.navigate({ to: '/login', replace: true })
  }

  return (
    <RootDocument>
      {session ? (
        <nav className="border-b border-ink/10 bg-paper px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <Link to="/" className="font-sora text-lg font-semibold text-ink">
              FinWarranty Ops
            </Link>
            <div className="flex items-center gap-6 font-manrope text-sm">
              <Link to="/" className="hover:text-accent">Overview</Link>
              <Link to="/dialer" className="hover:text-accent">Dialer</Link>
              <Link to="/crm" className="hover:text-accent">CRM</Link>
              <Link to="/email" className="hover:text-accent">Email</Link>
              <Link to="/spreadsheet" className="hover:text-accent">Sheet</Link>
              {(session.role === 'manager' || session.role === 'admin') && (
                <>
                  <Link to="/alerts" className="text-accent hover:text-ink">Alerts</Link>
                  <Link to="/users" className="text-accent hover:text-ink">Users</Link>
                </>
              )}
              <span className="hidden text-muted sm:inline">{session.email}</span>
              <button
                type="button"
                onClick={signOut}
                className="text-ink hover:text-accent"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
      ) : null}
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

import { useState, type ReactNode } from 'react'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  redirect,
  Scripts,
  useLocation,
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

const navLinks = [
  { to: '/', label: 'OVERVIEW' },
  { to: '/dialer', label: 'DIALER' },
  { to: '/crm', label: 'CRM' },
  { to: '/email', label: 'EMAIL' },
]

function RootComponent() {
  const session = Route.useLoaderData()
  const router = useRouter()
  const location = useLocation()
  const [reportsOpen, setReportsOpen] = useState(false)
  const isReportsActive = location.pathname === '/spreadsheet' || location.pathname === '/master'

  async function signOut() {
    const { getSupabaseClient } = await import('~/lib/auth')
    await getSupabaseClient().auth.signOut()
    router.navigate({ to: '/login', replace: true })
  }

  return (
    <RootDocument>
      {session ? (
        <header className="bg-paper px-6 pt-4 font-manrope">
          <div className="mx-auto flex max-w-7xl items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dark text-paper font-sora text-sm font-semibold">
                FW
              </div>
              <div>
                <h1 className="font-sora text-sm font-bold tracking-wide text-ink">
                  FINANCIAL WARRANTY
                </h1>
                <p className="text-xs text-muted">
                  {location.pathname === '/' ? 'Overview — summary across every source' : 'Internal operations dashboard'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full border border-ink/10 bg-card px-4 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5"
            >
              SIGN OUT
            </button>
          </div>

          <nav className="mx-auto mt-4 flex max-w-7xl gap-6 border-b border-ink/10 text-xs font-semibold tracking-wide text-muted">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: true }}
                activeProps={{ className: 'pb-3 border-b-2 border-ink text-ink' }}
                className="pb-3 hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <div
              className="relative pb-3 hover:text-ink"
              onMouseEnter={() => setReportsOpen(true)}
              onMouseLeave={() => setReportsOpen(false)}
            >
              <span className={`block pb-3 ${isReportsActive ? 'text-ink' : ''}`}>REPORTS ▾</span>
              {reportsOpen && (
                <div className="absolute left-0 top-full z-10 w-56 rounded-b-2xl border border-ink/10 bg-paper py-2 shadow-sm">
                  <Link
                    to="/spreadsheet"
                    activeOptions={{ exact: true }}
                    activeProps={{ className: 'block px-4 py-2 text-ink bg-ink/5' }}
                    className="block px-4 py-2 hover:bg-ink/5"
                  >
                    SALES CLOSING RATIO
                  </Link>
                  <Link
                    to="/master"
                    activeOptions={{ exact: true }}
                    activeProps={{ className: 'block px-4 py-2 text-ink bg-ink/5' }}
                    className="block px-4 py-2 hover:bg-ink/5"
                  >
                    MASTER MASTER
                  </Link>
                </div>
              )}
            </div>
            {(session.role === 'manager' || session.role === 'admin') && (
              <>
                <Link to="/alerts" className="pb-3 text-accent hover:text-ink">
                  ALERTS
                </Link>
                <Link to="/users" className="pb-3 text-accent hover:text-ink">
                  USERS
                </Link>
              </>
            )}
          </nav>
        </header>
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

import { createServerClient } from '@supabase/ssr'
import { createServerFn } from '@tanstack/react-start'
import {
  getRequestHeader,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { parseCookieHeader } from '@supabase/ssr'
import { getSupabaseAdmin } from './supabase'

export interface SessionUser {
  id: string
  email: string | undefined
  role: string
}

function getServerSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  }

  const cookieHeader = getRequestHeader('cookie') ?? ''

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader)
      },
      setAll(cookiesToSet, headers) {
        for (const c of cookiesToSet) {
          setCookie(c.name, c.value, c.options)
        }
        for (const [k, v] of Object.entries(headers)) {
          setResponseHeader(k, v)
        }
      },
    },
  })
}

export const getSession = createServerFn({
  method: 'GET',
}).handler(async (): Promise<SessionUser | null> => {
  const supabase = getServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return null
  }

  const user = data.user
  let role = 'agent'
  try {
    const admin = getSupabaseAdmin()
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (roleRow?.role) role = roleRow.role
  } catch {
    // leave default role
  }

  return { id: user.id, email: user.email, role }
})

export const requireRole = (role: string) =>
  createServerFn({
    method: 'GET',
  }).handler(async () => {
    const session = await getSession()
    if (!session) {
      throw new Error('Unauthorized')
    }
    if (session.role !== 'admin' && session.role !== 'manager' && session.role !== role) {
      throw new Error('Forbidden')
    }
    return session
  })

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSession } from './auth-server'
import { getSupabaseAdmin } from './supabase'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['agent', 'manager', 'admin']),
})

export const getUsers = createServerFn({
  method: 'GET',
}).handler(async () => {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'admin')) {
    throw new Error('Forbidden')
  }
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('profiles')
    .select('*, user_roles!left(role)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load users: ${error.message}`)

  return (data ?? []).map((row: any) => ({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    active: row.active,
    created_at: row.created_at,
    role: row.user_roles?.role ?? 'agent',
  }))
})

export const inviteUser = createServerFn({
  method: 'POST',
}).handler(async ({ data }: { data: unknown }) => {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'admin')) {
    throw new Error('Forbidden')
  }

  const payload = inviteSchema.parse(data)
  const admin = getSupabaseAdmin()

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(payload.email)
  if (inviteError || !invite?.user) {
    throw new Error(`Invite failed: ${inviteError?.message || 'unknown'}`)
  }

  const user = invite.user
  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    email: user.email ?? payload.email,
    active: true,
  })
  if (profileError) throw new Error(`Profile upsert failed: ${profileError.message}`)

  const { error: roleError } = await admin.from('user_roles').upsert({
    id: user.id,
    role: payload.role,
  })
  if (roleError) throw new Error(`Role assignment failed: ${roleError.message}`)

  return { id: user.id, email: user.email ?? payload.email, role: payload.role }
})

export const deactivateUser = createServerFn({
  method: 'POST',
}).handler(async ({ data }: { data: unknown }) => {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'admin')) {
    throw new Error('Forbidden')
  }

  const id = z.string().uuid().parse(data)
  if (id === session.id) throw new Error('You cannot deactivate yourself')

  const admin = getSupabaseAdmin()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) throw new Error(`Deactivation failed: ${error.message}`)
  return { id }
})

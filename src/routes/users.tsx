import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { deactivateUser, getUsers, inviteUser } from '~/lib/users'

export const Route = createFileRoute('/users')({
  component: UsersPage,
  loader: async () => {
    try {
      return await getUsers()
    } catch {
      throw redirect({ to: '/' })
    }
  },
})

function UsersPage() {
  const users = Route.useLoaderData()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('agent')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    try {
      await inviteUser({ data: { email, role } })
      setMessage('Invite sent.')
      setEmail('')
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function deactivate(id: string) {
    if (!confirm('Deactivate this user?')) return
    try {
      await deactivateUser({ data: id })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="font-manrope">
      <h1 className="mb-6 font-sora text-2xl font-semibold text-ink">
        User Management
      </h1>

      {message && <p className="mb-4 text-ink">{message}</p>}
      {error && (
        <p className="mb-4 border border-accent p-3 text-sm text-accent">
          {error}
        </p>
      )}

      <form onSubmit={invite} className="mb-8 flex flex-wrap items-end gap-4 border border-ink/10 p-4">
        <div>
          <label className="block text-sm text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-ink/10 bg-paper p-2 text-ink outline-none focus:border-ink"
          >
            <option value="agent">Agent</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          className="border border-ink/10 bg-ink p-2 px-4 text-paper hover:bg-ink/90"
        >
          Invite user
        </button>
      </form>

      <div className="overflow-x-auto border border-ink/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.full_name || '—'}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">{user.active ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => deactivate(user.id)}
                    className="text-accent hover:text-ink"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

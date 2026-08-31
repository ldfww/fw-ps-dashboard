import { createFileRoute } from '@tanstack/react-router'
import { syncAll } from '~/lib/sync'

export const Route = createFileRoute('/api/public/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({})) as { secret?: string; date?: string; user_group?: string }
        const expected = process.env.SYNC_SECRET
        if (!expected || body.secret !== expected) {
          return new Response('Unauthorized', { status: 401 })
        }
        try {
          const counts = await syncAll(body.date, body.user_group ?? null)
          return Response.json({ ok: true, counts })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return Response.json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})

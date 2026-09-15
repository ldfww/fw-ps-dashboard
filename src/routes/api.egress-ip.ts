import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '~/lib/auth-server'

export const Route = createFileRoute('/api/egress-ip')({
  server: {
    handlers: {
      GET: async () => {
        const session = await getSession()
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }
        try {
          const res = await fetch('https://api.ipify.org?format=json')
          const data = (await res.json()) as { ip: string }
          return Response.json({ ip: data.ip })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})

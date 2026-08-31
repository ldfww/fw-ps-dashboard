import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getThresholdAlerts } from '~/lib/alerts'
import { getSession } from '~/lib/auth-server'

const getAlerts = createServerFn({
  method: 'GET',
}).handler(async () => {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'admin')) {
    throw new Error('Forbidden')
  }
  return getThresholdAlerts()
})

export const Route = createFileRoute('/alerts')({
  component: AlertsPage,
  loader: async () => {
    try {
      return await getAlerts()
    } catch {
      throw redirect({ to: '/' })
    }
  },
})

function AlertsPage() {
  const alerts = Route.useLoaderData()

  return (
    <div className="font-manrope">
      <h1 className="mb-6 font-sora text-2xl font-semibold text-ink">
        Threshold Alerts
      </h1>

      <div className="overflow-x-auto border border-ink/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Threshold</th>
              <th className="px-4 py-3 text-right">Observed</th>
              <th className="px-4 py-3">At</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3">{alert.agent_id}</td>
                <td className="px-4 py-3">{alert.source}</td>
                <td className="px-4 py-3 text-right">{alert.threshold}</td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {alert.observed}
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(alert.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No threshold alerts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

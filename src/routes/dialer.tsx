import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { format } from 'date-fns'
import { fetchViciDialStats } from '~/lib/vicidial'

function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

const getViciDial = createServerFn({
  method: 'GET',
}).handler(async () => {
  const user = process.env.VICIDIAL_USER
  const pass = process.env.VICIDIAL_PASS
  if (!user || !pass) {
    throw new Error('VICIDIAL_USER and VICIDIAL_PASS are not configured')
  }

  const date = today()
  const rows = await fetchViciDialStats(date, 'CLS')
  return { date, rows }
})

export const Route = createFileRoute('/dialer')({
  component: DialerPage,
  loader: async () => await getViciDial(),
})

function DialerPage() {
  const data = Route.useLoaderData()

  return (
    <div className="font-manrope">
      <h1 className="mb-6 font-sora text-2xl font-semibold text-ink">
        ViciDial — Agent Shift / Talk Time
      </h1>

      <p className="mb-6 text-muted">Date: <span className="font-semibold text-ink">{data.date}</span></p>

      <div className="overflow-x-auto border border-ink/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3 text-right">Calls</th>
              <th className="px-4 py-3 text-right">Talk (s)</th>
              <th className="px-4 py-3 text-right">Wait (s)</th>
              <th className="px-4 py-3 text-right">Pause (s)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={`${row.agent_id}-${row.entry_date}`}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3">{row.agent_name}</td>
                <td className="px-4 py-3">{row.user_group}</td>
                <td className="px-4 py-3 text-right">{row.calls}</td>
                <td className="px-4 py-3 text-right">{row.talk_time_secs}</td>
                <td className="px-4 py-3 text-right">{row.wait_time_secs}</td>
                <td className="px-4 py-3 text-right">{row.pause_time_secs}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={6}>
                  No ViciDial stats found for the selected date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { fetchSheetTasks } from '~/lib/sheets'

const getSheet = createServerFn({
  method: 'GET',
}).handler(async () => {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
    throw new Error('Google Sheets service account is not configured')
  }
  const rows = await fetchSheetTasks()
  const total = rows.reduce((s, r) => s + r.tasks_assigned, 0)
  const average = rows.length ? total / rows.length : 0
  return { rows, average: Number(average.toFixed(1)) }
})

export const Route = createFileRoute('/spreadsheet')({
  component: SpreadsheetPage,
  loader: async () => await getSheet(),
})

function SpreadsheetPage() {
  const data = Route.useLoaderData()

  return (
    <div className="font-manrope">
      <h1 className="mb-2 font-sora text-2xl font-semibold text-ink">
        Supervisor Spreadsheet
      </h1>
      <p className="mb-6 text-sm text-muted">
        Manually logged daily tasks per agent. Team average:{' '}
        <span className="font-semibold text-ink">{data.average}</span> tasks per
        entry.
      </p>

      <div className="overflow-x-auto border border-ink/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Tasks assigned</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr
                key={`${row.agent_id}-${row.log_date}-${i}`}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3">{row.agent_id}</td>
                <td className="px-4 py-3">{row.log_date}</td>
                <td className="px-4 py-3 text-right">{row.tasks_assigned}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={3}>
                  No spreadsheet data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

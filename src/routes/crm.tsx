import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { computeForthReport, pullForthTasks, today } from '~/lib/forth'

const getCrmReport = createServerFn({
  method: 'GET',
}).handler(async () => {
  const apiKey = process.env.FORTH_API_KEY
  if (!apiKey) {
    throw new Error('FORTH_API_KEY is not configured')
  }

  const asOf = today()
  const { allTasks } = await pullForthTasks(apiKey)
  const report = computeForthReport(allTasks, asOf, asOf, asOf)

  return {
    asOf,
    totalOverdue: report.reduce((sum, r) => sum + r.overdue, 0),
    totalDone: report.reduce((sum, r) => sum + r.done, 0),
    rows: report
      .filter((r) => r.overdue > 0 || r.done > 0)
      .sort((a, b) => b.overdue - a.overdue),
  }
})

export const Route = createFileRoute('/crm')({
  component: CrmPage,
  loader: async () => await getCrmReport(),
})

function CrmPage() {
  const data = Route.useLoaderData()
  const { asOf, totalOverdue, totalDone, rows } = data

  return (
    <div className="font-manrope">
      <h1 className="mb-6 font-sora text-2xl font-semibold text-ink">
        ForthCRM Tasks
      </h1>
      <p className="mb-6 text-muted">
        Overdue as of <span className="font-semibold text-ink">{asOf}</span>
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total overdue" value={totalOverdue} accent={totalOverdue > 0} />
        <Kpi label="Done today" value={totalDone} />
      </div>

      <div className="overflow-x-auto border border-ink/10 bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3 text-right">Overdue</th>
              <th className="px-4 py-3 text-right">Done</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3">
                  {row.firstname} {row.lastname}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {row.overdue}
                </td>
                <td className="px-4 py-3 text-right">{row.done}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={3}>
                  No open or completed tasks found for the selected range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="border border-ink/10 p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-sora text-2xl font-semibold ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

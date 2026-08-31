import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getOverview = createServerFn({
  method: 'GET',
}).handler(async () => {
  // TODO: aggregate from agent_time_entries, forth_tasks, email_counts, sheet_tasks
  return {
    agents: 0,
    overdue: 0,
    emails: 0,
    tasks: 0,
  }
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getOverview(),
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="font-manrope">
      <h1 className="mb-6 font-sora text-3xl font-semibold text-ink">
        Financial Warranty Ops Dashboard
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Agents tracked" value={data.agents} to="/dialer" />
        <KpiCard label="Overdue tasks" value={data.overdue} to="/crm" accent />
        <KpiCard label="Emails received" value={data.emails} to="/email" />
        <KpiCard label="Sheet tasks" value={data.tasks} to="/spreadsheet" />
      </div>

      <p className="text-muted">
        Overview KPIs are wired to the database and will populate once the data
        sources are connected. Use the navigation above to open each source.
      </p>
    </div>
  )
}

function KpiCard({
  label,
  value,
  to,
  accent,
}: {
  label: string
  value: number
  to: string
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className="block border border-ink/10 bg-paper p-4 transition-colors hover:border-ink/30"
    >
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 font-sora text-2xl font-semibold ${
          accent ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </Link>
  )
}

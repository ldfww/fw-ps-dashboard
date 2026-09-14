import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { fetchNsfMasterRecords, type NsfMasterRecord } from '~/lib/sheets'

const getNsfMaster = createServerFn({ method: 'GET' }).handler(async () => {
  let records: NsfMasterRecord[] = []
  let source = 'sheets'
  let error: string | null = null

  try {
    records = await fetchNsfMasterRecords()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    source = /not (?:set|configured)|must be set/i.test(message) ? 'unconfigured' : 'error'
    error = source === 'unconfigured' ? 'Google Sheets NSF Master report is not configured.' : message
  }

  // Sheet order is chronological; show most recent month first.
  const ordered = [...records].reverse()
  return { records: ordered, source, error }
})

export const Route = createFileRoute('/nsf-master')({
  component: NsfMasterPage,
  loader: async () => await getNsfMaster(),
})

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`
}

function categoryColor(category: string) {
  const c = category.toLowerCase()
  if (c === 'paid') return 'text-green-700'
  if (c.includes('nsf')) return 'text-red-700'
  return 'text-ink'
}

function NsfMasterPage() {
  const data = Route.useLoaderData()
  const latest = data.records[0]
  const recoupRate = latest && latest.total_revenue_lost
    ? (latest.total_revenue_recouped / latest.total_revenue_lost) * 100
    : 0

  return (
    <div className="space-y-4 font-manrope">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-sora text-2xl font-semibold text-ink">NSF MASTER</h1>
          <p className="text-sm text-muted">Recovered vs. lost revenue from NSF payments, by month</p>
        </div>
        <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-muted">
          {data.source === 'sheets' ? 'LIVE SHEET' : data.source === 'unconfigured' ? 'NOT CONFIGURED' : 'ERROR'}
        </span>
      </div>

      {data.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.error}</div>
      )}

      {latest && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">LATEST MONTH · {latest.month.toUpperCase()}</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <KpiCard label="TOTAL REVENUE LOST" value={formatMoney(latest.total_revenue_lost)} accent="red" />
            <KpiCard label="TOTAL REVENUE RECOUPED" value={formatMoney(latest.total_revenue_recouped)} accent="green" />
            <KpiCard label="RECOUP RATE" value={formatPct(recoupRate)} />
          </div>
        </div>
      )}

      {latest && (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 font-sora text-ink">
              <tr>
                <th className="px-4 py-3">Category · {latest.month}</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {latest.categories.map((c) => (
                <tr key={c.category} className="border-b border-ink/10 last:border-0">
                  <td className={`px-4 py-3 font-medium ${categoryColor(c.category)}`}>{c.category}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.amount)}</td>
                  <td className="px-4 py-3 text-right">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Total Lost</th>
              <th className="px-4 py-3 text-right">Total Recouped</th>
              <th className="px-4 py-3 text-right">Recoup Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((r) => {
              const rate = r.total_revenue_lost ? (r.total_revenue_recouped / r.total_revenue_lost) * 100 : 0
              return (
                <tr key={r.month} className="border-b border-ink/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.month}</td>
                  <td className="px-4 py-3 text-right text-red-700">{formatMoney(r.total_revenue_lost)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatMoney(r.total_revenue_recouped)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPct(rate)}</td>
                </tr>
              )
            })}
            {data.records.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No NSF Master data found. Confirm the sheet is shared with the service account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Matches the NSF Master spreadsheet monthly &quot;Month over month&quot; tab. Categories break down what happened to
        clients who were NSF: paid, still NSF, rescheduled, or cancelling.
      </p>
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'text-green-700' : accent === 'red' ? 'text-red-700' : 'text-ink'
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className={`font-sora text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted">{label}</p>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { fetchCancelMasterRecords, type CancelMasterRecord } from '~/lib/sheets'

const getCancelMaster = createServerFn({ method: 'GET' }).handler(async () => {
  let records: CancelMasterRecord[] = []
  let source = 'sheets'
  let error: string | null = null

  try {
    records = await fetchCancelMasterRecords()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    source = /not (?:set|configured)|must be set/i.test(message) ? 'unconfigured' : 'error'
    error = source === 'unconfigured' ? 'Google Sheets Cancel Master report is not configured.' : message
  }

  // Sheet order is chronological; show most recent month first.
  const ordered = [...records].reverse()
  return { records: ordered, source, error }
})

export const Route = createFileRoute('/cancel-master')({
  component: CancelMasterPage,
  loader: async () => await getCancelMaster(),
})

function formatPct(n: number) {
  return `${n.toFixed(2)}%`
}

function CancelMasterPage() {
  const data = Route.useLoaderData()
  const latest = data.records[0]

  return (
    <div className="space-y-4 font-manrope">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-sora text-2xl font-semibold text-ink">CANCEL MASTER</h1>
          <p className="text-sm text-muted">Cancellation requests vs. retained clients, by month</p>
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard label="REQUESTS" value={latest.total.request} />
            <KpiCard label="POC" value={latest.total.poc} />
            <KpiCard label="LOSS (REQUEST − PAID)" value={latest.total.loss} accent="red" />
            <KpiCard label="PAID / RETAINED" value={latest.total.paid_retained} accent="green" />
            <KpiCard label="RETAINED RATIO" value={formatPct(latest.total.retained_ratio)} accent="green" />
          </div>
        </div>
      )}

      {latest && (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 font-sora text-ink">
              <tr>
                <th className="px-4 py-3">Bucket · {latest.month}</th>
                <th className="px-4 py-3 text-right">Request</th>
                <th className="px-4 py-3 text-right">POC</th>
                <th className="px-4 py-3 text-right">Loss</th>
                <th className="px-4 py-3 text-right">Paid / Retained</th>
                <th className="px-4 py-3 text-right">Retained Ratio</th>
              </tr>
            </thead>
            <tbody>
              {latest.buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-ink/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{b.bucket}</td>
                  <td className="px-4 py-3 text-right">{b.request}</td>
                  <td className="px-4 py-3 text-right">{b.poc}</td>
                  <td className="px-4 py-3 text-right text-red-700">{b.loss}</td>
                  <td className="px-4 py-3 text-right text-green-700">{b.paid_retained}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPct(b.retained_ratio)}</td>
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
              <th className="px-4 py-3 text-right">Requests</th>
              <th className="px-4 py-3 text-right">POC</th>
              <th className="px-4 py-3 text-right">Loss</th>
              <th className="px-4 py-3 text-right">Paid / Retained</th>
              <th className="px-4 py-3 text-right">Retained Ratio</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((r) => (
              <tr key={r.month} className="border-b border-ink/10 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.month}</td>
                <td className="px-4 py-3 text-right">{r.total.request}</td>
                <td className="px-4 py-3 text-right">{r.total.poc}</td>
                <td className="px-4 py-3 text-right text-red-700">{r.total.loss}</td>
                <td className="px-4 py-3 text-right text-green-700">{r.total.paid_retained}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatPct(r.total.retained_ratio)}</td>
              </tr>
            ))}
            {data.records.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={6}>
                  No Cancel Master data found. Confirm the sheet is shared with the service account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Matches the Cancel Master spreadsheet &quot;Month over Month&quot; tab. Each month is split into &quot;Zero months&quot;
        and &quot;1-99&quot; client-tenure buckets, plus a Total row shown here.
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

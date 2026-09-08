import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { aggregateSalesClosingRecords, fetchSalesClosingRecords, type SalesClosingRecord } from '~/lib/sheets'
import { getSupabaseAdmin } from '~/lib/supabase'

const getSalesClosing = createServerFn({
  method: 'GET',
}).handler(async () => {
  let records: SalesClosingRecord[] = []
  let source = 'sheets'

  try {
    records = await fetchSalesClosingRecords()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/not (?:set|configured)|must be set/i.test(message)) {
      source = 'supabase'
      const { data, error } = await getSupabaseAdmin()
        .from('sales_closing_records')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(`Failed to load sales closing records: ${error.message}`)
      records = (data ?? []) as SalesClosingRecord[]
    } else {
      throw err
    }
  }

  const { total, agents, dateRange } = aggregateSalesClosingRecords(records)
  return { source, total, agents, dateRange }
})

export const Route = createFileRoute('/spreadsheet')({
  component: SpreadsheetPage,
  loader: async () => await getSalesClosing(),
})

function formatPct(n: number) {
  return `${n.toFixed(2)}%`
}

function SpreadsheetPage() {
  const data = Route.useLoaderData()
  const { total, agents, dateRange } = data

  return (
    <div className="space-y-4 font-manrope">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-sora text-2xl font-semibold text-ink">SALES CLOSING RATIO</h1>
          <p className="text-sm text-muted">
            {dateRange ? `Date range: ${dateRange}` : 'Source: supervisor spreadsheet results tab'}
          </p>
        </div>
        <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-muted">
          {data.source === 'sheets' ? 'LIVE SHEET' : 'PERSISTED'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="BOOKED SALES" value={total.booked_sales} />
        <KpiCard label="PAID SALES (GREEN)" value={total.paid_sales} accent="green" />
        <KpiCard label="CLOSING RATIO" value={formatPct(total.closing_ratio)} />
        <KpiCard label="CANCELLED CLIENTS" value={total.cancelled_clients} accent="red" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="RED (NSF)" value={total.red_nsf} accent="red" />
        <KpiCard label="GRAY (PENDING CANCEL)" value={total.gray_pending_cancel} />
        <KpiCard label="WHITE (SCHEDULED)" value={total.white_scheduled} />
        <KpiCard label="AGENTS" value={agents.length} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3 text-right">Booked</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Red (NSF)</th>
              <th className="px-4 py-3 text-right">Gray</th>
              <th className="px-4 py-3 text-right">Closing Ratio</th>
              <th className="px-4 py-3 text-right">Cancelled</th>
              <th className="px-4 py-3 text-right">White</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((row) => (
              <tr
                key={row.agent_id}
                className="border-b border-ink/10 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-ink">{row.agent_id}</td>
                <td className="px-4 py-3 text-right">{row.booked_sales}</td>
                <td className="px-4 py-3 text-right text-green-700">{row.paid_sales}</td>
                <td className="px-4 py-3 text-right text-red-700">{row.red_nsf}</td>
                <td className="px-4 py-3 text-right">{row.gray_pending_cancel}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatPct(row.closing_ratio)}</td>
                <td className="px-4 py-3 text-right">{row.cancelled_clients}</td>
                <td className="px-4 py-3 text-right">{row.white_scheduled}</td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={8}>
                  No sales closing data found. Configure Google Sheets credentials or run the sync to populate the
                  database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Matches the supervisor spreadsheet &quot;results&quot; sheet. The total row is extracted separately; per-agent rows are
        shown above. Run the nightly sync or press the spreadsheet update button to refresh the source data.
      </p>
    </div>
  )
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'green' | 'red'
}) {
  const color = accent === 'green' ? 'text-green-700' : accent === 'red' ? 'text-red-700' : 'text-ink'
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className={`font-sora text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted">{label}</p>
    </div>
  )
}

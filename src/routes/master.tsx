import type { ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { fetchMasterMasterRecords, type MasterMasterRecord } from '~/lib/sheets'

function currentDate() {
  return format(new Date(), 'yyyy-MM-dd')
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const getMasterRecords = createServerFn({ method: 'GET' })
  .validator((input: { from: string; to: string }) => input)
  .handler(async ({ data }) => {
    let records: MasterMasterRecord[] = []
    let source = 'sheets'
    let error: string | null = null

    try {
      records = await fetchMasterMasterRecords()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      source = /not (?:set|configured)|must be set/i.test(message) ? 'unconfigured' : 'error'
      error = source === 'unconfigured' ? 'Google Sheets master report is not configured.' : message
    }

    records.sort((a, b) => b.date.localeCompare(a.date))
    return { records, source, error, from: data.from, to: data.to }
  })

export const Route = createFileRoute('/master')({
  validateSearch: (search: Record<string, unknown>) => {
    const to = isDate(search.to) ? search.to : currentDate()
    return {
      from: isDate(search.from) ? search.from : format(subDays(parseISO(to), 6), 'yyyy-MM-dd'),
      to,
    }
  },
  loaderDeps: ({ search }) => search,
  component: MasterPage,
  loader: async ({ deps }) => await getMasterRecords({ data: deps }),
})

function formatPct(n: number) {
  return `${n.toFixed(2)}%`
}

function summarize(records: MasterMasterRecord[]) {
  const sums = records.reduce((total, row) => ({
    active_clients: total.active_clients + row.active_clients,
    reschedule: total.reschedule + row.reschedule,
    nsf_recurring: total.nsf_recurring + row.nsf_recurring,
    cancels: total.cancels + row.cancels,
    poc: total.poc + row.poc,
    paid_retention: total.paid_retention + row.paid_retention,
    sales: total.sales + row.sales,
    fp_paid: total.fp_paid + row.fp_paid,
    fp_nsf: total.fp_nsf + row.fp_nsf,
    fp_gray: total.fp_gray + row.fp_gray,
  }), {
    active_clients: 0, reschedule: 0, nsf_recurring: 0, cancels: 0, poc: 0,
    paid_retention: 0, sales: 0, fp_paid: 0, fp_nsf: 0, fp_gray: 0,
  })
  const fpTotal = sums.fp_paid + sums.fp_nsf + sums.fp_gray
  return { ...sums, fp_ratio: fpTotal ? (sums.fp_paid / fpTotal) * 100 : 0, days: records.length }
}

function Delta({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const delta = current - previous
  const color = delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-muted'
  return <span className={`text-xs font-semibold ${color}`}>{delta > 0 ? '+' : ''}{delta.toFixed(suffix ? 2 : 0)}{suffix}</span>
}

function MasterPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const fromDate = parseISO(search.from)
  const toDate = parseISO(search.to)
  const span = Math.max(differenceInCalendarDays(toDate, fromDate) + 1, 1)
  const previousTo = subDays(fromDate, 1)
  const previousFrom = subDays(previousTo, span - 1)
  const selected = data.records.filter((row) => row.date >= search.from && row.date <= search.to)
  const previous = data.records.filter((row) => row.date >= format(previousFrom, 'yyyy-MM-dd') && row.date <= format(previousTo, 'yyyy-MM-dd'))
  const summary = summarize(selected)
  const previousSummary = summarize(previous)

  function setRange(from: Date, to: Date) {
    navigate({ to: '/master', search: { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') } })
  }

  function setMonth(monthOffset: number) {
    const month = subMonths(new Date(), monthOffset)
    setRange(startOfMonth(month), monthOffset === 0 ? new Date() : endOfMonth(month))
  }

  return (
    <div className="space-y-4 font-manrope">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sora text-2xl font-semibold text-ink">MASTER MASTER REPORT</h1>
          <p className="text-sm text-muted">{search.from} → {search.to} · compared with previous {span} day{span === 1 ? '' : 's'}</p>
        </div>
        <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-muted">
          {data.source === 'sheets' ? 'LIVE SHEET' : data.source === 'unconfigured' ? 'NOT CONFIGURED' : 'ERROR'}
        </span>
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="FROM" value={search.from} onChange={(from) => navigate({ to: '/master', search: { ...search, from } })} />
          <DateInput label="TO" value={search.to} onChange={(to) => navigate({ to: '/master', search: { ...search, to } })} />
          <Preset label="TODAY" onClick={() => setRange(new Date(), new Date())} />
          <Preset label="7D" onClick={() => setRange(subDays(new Date(), 6), new Date())} />
          <Preset label="30D" onClick={() => setRange(subDays(new Date(), 29), new Date())} />
          <Preset label="THIS MONTH" onClick={() => setMonth(0)} />
          <Preset label="LAST MONTH" onClick={() => setMonth(1)} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="ACTIVE CLIENTS" value={summary.active_clients} comparison={<Delta current={summary.active_clients} previous={previousSummary.active_clients} />} />
        <KpiCard label="RESCHEDULE" value={summary.reschedule} comparison={<Delta current={summary.reschedule} previous={previousSummary.reschedule} />} />
        <KpiCard label="NSF RECURRING" value={summary.nsf_recurring} accent="red" comparison={<Delta current={summary.nsf_recurring} previous={previousSummary.nsf_recurring} />} />
        <KpiCard label="CANCELS" value={summary.cancels} accent="red" comparison={<Delta current={summary.cancels} previous={previousSummary.cancels} />} />
        <KpiCard label="POC" value={summary.poc} comparison={<Delta current={summary.poc} previous={previousSummary.poc} />} />
        <KpiCard label="PAID RETENTION" value={summary.paid_retention} accent="green" comparison={<Delta current={summary.paid_retention} previous={previousSummary.paid_retention} />} />
        <KpiCard label="SALES" value={summary.sales} accent="green" comparison={<Delta current={summary.sales} previous={previousSummary.sales} />} />
        <KpiCard label="FP PAID" value={summary.fp_paid} accent="green" comparison={<Delta current={summary.fp_paid} previous={previousSummary.fp_paid} />} />
        <KpiCard label="FP NSF" value={summary.fp_nsf} accent="red" comparison={<Delta current={summary.fp_nsf} previous={previousSummary.fp_nsf} />} />
        <KpiCard label="FP GRAY" value={summary.fp_gray} comparison={<Delta current={summary.fp_gray} previous={previousSummary.fp_gray} />} />
        <KpiCard label="FP RATIO" value={formatPct(summary.fp_ratio)} comparison={<Delta current={summary.fp_ratio} previous={previousSummary.fp_ratio} suffix="%" />} />
        <KpiCard label="DAYS WITH DATA" value={summary.days} comparison={<span className="text-xs text-muted">Previous: {previousSummary.days}</span>} />
      </div>

      {data.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 font-sora text-ink"><tr>
            <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Active Clients</th><th className="px-4 py-3 text-right">Reschedule</th><th className="px-4 py-3 text-right">NSF Recurring</th><th className="px-4 py-3 text-right">Cancels</th><th className="px-4 py-3 text-right">POC</th><th className="px-4 py-3 text-right">Paid Retention</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">FP Paid</th><th className="px-4 py-3 text-right">FP NSF</th><th className="px-4 py-3 text-right">FP Gray</th><th className="px-4 py-3 text-right">FP Ratio</th>
          </tr></thead>
          <tbody>
            {selected.map((row) => <tr key={row.date} className="border-b border-ink/10 last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{row.date}</td><td className="px-4 py-3 text-right">{row.active_clients}</td><td className="px-4 py-3 text-right">{row.reschedule}</td><td className="px-4 py-3 text-right text-red-700">{row.nsf_recurring}</td><td className="px-4 py-3 text-right text-red-700">{row.cancels}</td><td className="px-4 py-3 text-right">{row.poc}</td><td className="px-4 py-3 text-right text-green-700">{row.paid_retention}</td><td className="px-4 py-3 text-right text-green-700">{row.sales}</td><td className="px-4 py-3 text-right text-green-700">{row.fp_paid}</td><td className="px-4 py-3 text-right text-red-700">{row.fp_nsf}</td><td className="px-4 py-3 text-right">{row.fp_gray}</td><td className="px-4 py-3 text-right font-semibold">{formatPct(row.fp_ratio)}</td>
            </tr>)}
            {selected.length === 0 && <tr><td className="px-4 py-6 text-muted" colSpan={12}>No master report data found for this date range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-semibold text-muted">{label}<input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink" /></label>
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/5">{label}</button>
}

function KpiCard({ label, value, accent, comparison }: { label: string; value: number | string; accent?: 'green' | 'red'; comparison: ReactNode }) {
  const color = accent === 'green' ? 'text-green-700' : accent === 'red' ? 'text-red-700' : 'text-ink'
  return <div className="rounded-2xl bg-card p-4 shadow-sm"><p className={`font-sora text-2xl font-bold ${color}`}>{value}</p><div className="mt-1 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">{label}</p>{comparison}</div></div>
}

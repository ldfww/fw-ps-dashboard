import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { format, subDays } from 'date-fns'
import { fetchGmailRange } from '~/lib/gmail'
import { getSupabaseAdmin } from '~/lib/supabase'
import { fetchViciDialStats } from '~/lib/vicidial'
import { aggregateSalesClosingRecords, fetchMasterMasterRecords, fetchSalesClosingRecords, type MasterMasterRecord, type SalesClosingRecord } from '~/lib/sheets'

const getOverview = createServerFn({
  method: 'GET',
}).handler(async () => {
  const now = new Date()
  const date = format(now, 'yyyy-MM-dd')
  const emailFrom = format(subDays(now, 6), 'yyyy-MM-dd')
  const admin = getSupabaseAdmin()

  let salesRecords: SalesClosingRecord[] = []
  try {
    salesRecords = await fetchSalesClosingRecords()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/not (?:set|configured)|must be set/i.test(message)) {
      const { data, error } = await admin
        .from('sales_closing_records')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(`Failed to load sales closing records: ${error.message}`)
      salesRecords = (data ?? []) as SalesClosingRecord[]
    } else {
      throw err
    }
  }
  const sales = aggregateSalesClosingRecords(salesRecords)

  let masterRecords: MasterMasterRecord[] = []
  try {
    masterRecords = await fetchMasterMasterRecords()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/not (?:set|configured)|must be set/i.test(message)) throw err
  }
  const latestMaster = masterRecords.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

  const [{ data: forthUsers, error: usersError }, dialerRows, emailCounts] = await Promise.all([
    admin.from('forth_users').select('id, role_name, active'),
    fetchViciDialStats(date, null).catch(() => [] as Awaited<ReturnType<typeof fetchViciDialStats>>),
    fetchGmailRange(emailFrom, date).catch(() => [] as Awaited<ReturnType<typeof fetchGmailRange>>),
  ])
  if (usersError) throw new Error(`Failed to load Forth users: ${usersError.message}`)

  const clientServicesIds = (forthUsers ?? [])
    .filter((user) => {
      const role = String(user.role_name ?? '').trim().toLowerCase()
      return user.active !== false && (role === 'client services' || role === 'cls')
    })
    .map((user) => user.id)

  let crm = { open: 0, overdue: 0, completed: 0, agents: clientServicesIds.length }
  if (clientServicesIds.length > 0) {
    const [openResult, overdueResult, completedResult] = await Promise.all([
      admin.from('forth_tasks').select('*', { count: 'exact', head: true })
        .in('user_id', clientServicesIds).eq('task_completed', false),
      admin.from('forth_tasks').select('*', { count: 'exact', head: true })
        .in('user_id', clientServicesIds).eq('task_completed', false).lt('task_due_date', date),
      admin.from('forth_tasks').select('*', { count: 'exact', head: true })
        .in('user_id', clientServicesIds).eq('task_completed', true).eq('task_completed_date', date),
    ])
    const queryError = openResult.error ?? overdueResult.error ?? completedResult.error
    if (queryError) throw new Error(`Failed to load Forth overview: ${queryError.message}`)
    const overdue = overdueResult.count ?? 0
    crm = {
      open: Math.max((openResult.count ?? 0) - overdue, 0),
      overdue,
      completed: completedResult.count ?? 0,
      agents: clientServicesIds.length,
    }
  }

  const calls = dialerRows.reduce((sum, row) => sum + row.calls, 0)
  const talkPct = dialerRows.length
    ? dialerRows.reduce((sum, row) => sum + (row.talk_time_secs / (row.login_time_secs || 1)) * 100, 0) / dialerRows.length
    : 0

  return {
    dialer: { agents: dialerRows.length, calls, talkPct: Number(talkPct.toFixed(1)) },
    crm,
    email: {
      received: emailCounts.reduce((sum, count) => sum + count.received, 0),
      opened: emailCounts.reduce((sum, count) => sum + count.opened, 0),
      unopened: emailCounts.reduce((sum, count) => sum + count.unopened, 0),
    },
    spreadsheet: { agents: 0, avgDay: 0 },
    sales: {
      dateRange: sales.dateRange,
      booked: sales.total.booked_sales,
      paid: sales.total.paid_sales,
      red: sales.total.red_nsf,
      gray: sales.total.gray_pending_cancel,
      ratio: sales.total.closing_ratio,
      cancelled: sales.total.cancelled_clients,
      white: sales.total.white_scheduled,
    },
    master: latestMaster,
  }
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getOverview(),
})

function Home() {
  const data = Route.useLoaderData()

  return (
    <div className="space-y-4 font-manrope">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SourceCard
          to="/dialer"
          title="DIALER"
          subtitle="Agent time from ViciDial"
          metrics={[
            { label: 'AGENTS', value: data.dialer.agents },
            { label: 'CALLS', value: data.dialer.calls },
            { label: 'TALK', value: `${data.dialer.talkPct}%` },
          ]}
        />
        <SourceCard
          to="/crm"
          title="CRM"
          subtitle="Task follow-ups from Forth"
          metrics={[
            { label: 'OPEN', value: data.crm.open },
            { label: 'OVERDUE', value: data.crm.overdue, accent: true },
            { label: 'COMPLETED', value: data.crm.completed },
          ]}
        />
        <SourceCard
          to="/email"
          title="EMAIL"
          subtitle="Mailbox last 7 days"
          metrics={[
            { label: 'RECEIVED', value: data.email.received },
            { label: 'OPENED', value: data.email.opened },
            { label: 'UNOPENED', value: data.email.unopened },
          ]}
        />
        <SourceCard
          to="/spreadsheet"
          title="SALES"
          subtitle={data.sales.dateRange || 'Closing ratio sheet'}
          metrics={[
            { label: 'BOOKED', value: data.sales.booked },
            { label: 'PAID', value: data.sales.paid },
            { label: 'RATIO', value: `${data.sales.ratio.toFixed(2)}%` },
          ]}
        />
        <SourceCard
          to="/master"
          title="MASTER"
          subtitle={data.master ? `Master Master · ${data.master.date}` : 'Master sheet not configured'}
          metrics={[
            { label: 'ACTIVE', value: data.master?.active_clients ?? 0 },
            { label: 'SALES', value: data.master?.sales ?? 0 },
            { label: 'FP RATIO', value: `${data.master?.fp_ratio.toFixed(2) ?? 0}%` },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClosingRatio data={data.sales} />
        <EarlyWarning />
      </div>
    </div>
  )
}

function SourceCard({
  to,
  title,
  subtitle,
  metrics,
}: {
  to: string
  title: string
  subtitle: string
  metrics: { label: string; value: number | string; accent?: boolean }[]
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-2xl bg-card p-6 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-sora text-sm font-bold text-ink">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold text-muted group-hover:text-ink">OPEN →</span>
      </div>
      <div className="mt-6 flex items-end gap-6">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className={`font-sora text-3xl font-bold ${m.accent ? 'text-accent' : 'text-ink'}`}>
              {m.value}
            </p>
            <p className="text-xs font-semibold text-muted">{m.label}</p>
          </div>
        ))}
      </div>
    </Link>
  )
}

function ClosingRatio({
  data,
}: {
  data: {
    dateRange: string
    booked: number
    paid: number
    red: number
    gray: number
    ratio: number
    cancelled: number
    white: number
  }
}) {
  const didNotPay = Math.max(data.booked - data.paid - data.red - data.gray - data.white, 0)
  const width = Math.min(Math.max(data.ratio, 0), 100)

  return (
    <div className="rounded-2xl bg-dark p-6 text-paper">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-sora text-sm font-bold">CLOSING RATIO</h2>
          <p className="text-xs text-paper/60">{data.dateRange || 'Latest sheet range'}</p>
        </div>
        <button className="rounded-full border border-paper/20 px-3 py-1 text-xs font-semibold hover:bg-paper/10">
          EXPORT
        </button>
      </div>

      <div className="mt-4">
        <p className="font-sora text-5xl font-bold">{data.ratio.toFixed(2)}<span className="text-2xl">%</span></p>
        <p className="mt-1 text-xs text-paper/60">
          {data.paid} PAID OF {data.booked} BOOKED · {data.white} SCHEDULED
        </p>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-paper/20">
        <div className="h-2 rounded-full bg-paper" style={{ width: `${width}%` }} />
      </div>

      <div className="mt-4 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-paper" /> Paid</span>
          <span className="font-semibold">{data.paid}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" /> Red (NSF)</span>
          <span className="font-semibold">{data.red}</span>
        </div>
        {didNotPay > 0 && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-paper/40" /> Did not pay</span>
            <span className="font-semibold">{didNotPay}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-paper/40" /> Pending cancel</span>
          <span className="font-semibold">{data.gray}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-paper/20" /> Cancelled</span>
          <span className="font-semibold">{data.cancelled}</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-paper/40">
        Pulled from the supervisor spreadsheet results tab and refreshed on sync.
      </p>
    </div>
  )
}

function EarlyWarning() {
  const weeks = [
    { w: 'W1', overdue: 15, closing: 45 },
    { w: 'W2', overdue: 18, closing: 48 },
    { w: 'W3', overdue: 25, closing: 44 },
    { w: 'W4', overdue: 35, closing: 40 },
    { w: 'W5', overdue: 42, closing: 38 },
    { w: 'W6', overdue: 50, closing: 36 },
  ]

  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-sora text-sm font-bold text-ink">EARLY WARNING</h2>
          <p className="text-xs text-muted">Overdue follow-ups vs closing ratio · illustration only · last six weeks</p>
        </div>
        <button className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5">
          EXPORT
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full bg-accent" /> Overdue follow-ups</span>
        <span className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full bg-ink/40" /> Closing ratio %</span>
      </div>

      <div className="mt-6 flex h-40 items-end justify-between gap-2">
        {weeks.map((wk) => (
          <div key={wk.w} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-end gap-1">
              <div className="w-1/2 rounded-t bg-accent" style={{ height: `${wk.overdue}%` }} />
              <div className="w-1/2 rounded-t bg-ink/30" style={{ height: `${wk.closing}%` }} />
            </div>
            <span className="text-xs text-muted">{wk.w}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        Side by side, a rise in overdue follow-ups becomes an early warning weeks before it shows up as missed payments and cancellations.
      </p>
    </div>
  )
}

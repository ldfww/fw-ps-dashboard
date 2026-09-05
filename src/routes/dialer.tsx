import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import { syncViciDialRange, type ViciDialStatsRow } from '~/lib/vicidial'

function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatHHMM(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function aggregateRows(rows: ViciDialStatsRow[]) {
  const agents = new Map<string, ViciDialStatsRow>()
  for (const row of rows) {
    const current = agents.get(row.agent_id)
    if (!current) {
      agents.set(row.agent_id, { ...row })
      continue
    }
    current.calls += row.calls
    current.talk_time_secs += row.talk_time_secs
    current.wait_time_secs += row.wait_time_secs
    current.pause_time_secs += row.pause_time_secs
    current.login_time_secs += row.login_time_secs
  }
  return Array.from(agents.values()).sort((a, b) => b.calls - a.calls || a.agent_name.localeCompare(b.agent_name))
}

const getViciDial = createServerFn({ method: 'GET' })
  .validator((input: { from: string; to: string; group: string }) => input)
  .handler(async ({ data }) => {
    const days = differenceInCalendarDays(parseISO(data.to), parseISO(data.from))
    if (days < 0 || days > 30) throw new Error('Dialer date range must be between 1 and 31 days')
    const allRows = await syncViciDialRange(data.from, data.to, null)
    const groups = Array.from(new Set(allRows.map((row) => row.user_group).filter(Boolean))).sort()
    const filtered = data.group === 'all' ? allRows : allRows.filter((row) => row.user_group === data.group)
    return { from: data.from, to: data.to, group: data.group, groups, rows: aggregateRows(filtered) }
  })

export const Route = createFileRoute('/dialer')({
  validateSearch: (search: Record<string, unknown>) => {
    const to = isDate(search.to) ? search.to : today()
    return {
      from: isDate(search.from) ? search.from : to,
      to,
      group: typeof search.group === 'string' && search.group ? search.group : 'all',
    }
  },
  loaderDeps: ({ search }) => search,
  component: DialerPage,
  loader: async ({ deps }) => await getViciDial({ data: deps }),
})

function DialerPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const totalCalls = data.rows.reduce((sum, row) => sum + row.calls, 0)
  const totalLogin = data.rows.reduce((sum, row) => sum + row.login_time_secs, 0)
  const avgTalkPct = data.rows.length
    ? data.rows.reduce((sum, row) => sum + (row.talk_time_secs / (row.login_time_secs || 1)) * 100, 0) / data.rows.length
    : 0
  const avgPausePct = data.rows.length
    ? data.rows.reduce((sum, row) => sum + (row.pause_time_secs / (row.login_time_secs || 1)) * 100, 0) / data.rows.length
    : 0

  function update(next: Partial<typeof search>) {
    navigate({ to: '/dialer', search: { ...search, ...next } })
  }

  function setPreset(days: number) {
    const to = today()
    update({ from: format(subDays(parseISO(to), days - 1), 'yyyy-MM-dd'), to })
  }

  return (
    <div className="font-manrope">
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <DateInput label="FROM" value={search.from} onChange={(from) => update({ from })} />
        <DateInput label="TO" value={search.to} onChange={(to) => update({ to })} />
        {[1, 7, 14, 30].map((days) => (
          <button key={days} type="button" onClick={() => setPreset(days)} className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-ink hover:bg-ink/5">
            {days === 1 ? 'TODAY' : `${days}D`}
          </button>
        ))}
        <label className="text-xs font-semibold text-muted">
          <span className="mb-1 block">USER GROUP</span>
          <select value={search.group} onChange={(event) => update({ group: event.target.value })} className="rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink">
            <option value="all">All groups</option>
            {data.groups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          <span className="mb-1 block">CAMPAIGN</span>
          <select disabled className="rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-muted">
            <option>All campaigns</option>
          </select>
        </label>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiBox label="AGENTS" value={data.rows.length} />
        <KpiBox label="CALLS" value={totalCalls} />
        <KpiBox label="LOGGED IN" value={formatHHMM(data.rows.length ? Math.round(totalLogin / data.rows.length) : 0)} />
        <KpiBox label="TALK" value={`${avgTalkPct.toFixed(1)}%`} />
        <KpiBox label="PAUSE" value={`${avgPausePct.toFixed(1)}%`} />
      </div>

      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-sora text-sm font-bold text-ink">AGENT TIME</h2>
            <p className="text-xs text-muted">Live from ViciDial · {data.from} → {data.to} · {search.group === 'all' ? 'All groups' : search.group}</p>
          </div>
          <button className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5">EXPORT</button>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ink" /> Talk</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ink/30" /> Wait</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" /> Pause</span>
        </div>

        <div className="mt-4 space-y-3">
          {data.rows.map((row) => {
            const total = row.login_time_secs || 1
            const talkPct = (row.talk_time_secs / total) * 100
            const waitPct = (row.wait_time_secs / total) * 100
            const pausePct = (row.pause_time_secs / total) * 100
            return (
              <div key={row.agent_id}>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="font-semibold text-ink">{row.agent_name}</span>
                  <span className="text-right text-muted">{row.user_group} · {row.calls} calls · {talkPct.toFixed(1)}% talk · {pausePct.toFixed(1)}% pause</span>
                </div>
                <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full bg-ink" style={{ width: `${talkPct}%` }} />
                  <div className="h-full bg-ink/30" style={{ width: `${waitPct}%` }} />
                  <div className="h-full bg-accent" style={{ width: `${pausePct}%` }} />
                </div>
              </div>
            )
          })}
          {data.rows.length === 0 && <p className="py-6 text-center text-xs text-muted">No ViciDial stats found for this range and user group.</p>}
        </div>
      </div>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-muted">
      <span className="mb-1 block">{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm text-ink" />
    </label>
  )
}

function KpiBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 font-sora text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

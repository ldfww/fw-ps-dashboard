import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { computeForthReport } from '~/lib/forth'
import { getSupabaseAdmin } from '~/lib/supabase'

interface ForthDbRow {
  id: string
  user_id: string
  firstname: string
  lastname: string
  user_name: string
  title: string
  task_note: string
  task_due_date: string | null
  task_status: string
  task_completed: boolean
  task_completed_date: string | null
  task_created_date: string | null
}

function rowToTask(row: ForthDbRow) {
  return {
    id: row.id,
    userId: row.user_id,
    firstname: row.firstname || undefined,
    lastname: row.lastname || undefined,
    user_name: row.user_name || undefined,
    title: row.title || undefined,
    task_note: row.task_note || undefined,
    task_due_date: row.task_due_date || undefined,
    task_status: row.task_status || undefined,
    task_completed: row.task_completed,
    task_completed_date: row.task_completed_date || undefined,
    task_created_date: row.task_created_date || undefined,
  }
}

type DateRange = 'today' | 'yesterday' | '7d' | '14d' | '30d'

const rangeDays: Record<DateRange, number> = {
  today: 1,
  yesterday: 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
}

function isDateRange(value: unknown): value is DateRange {
  return typeof value === 'string' && value in rangeDays
}

const getCrmReport = createServerFn({
  method: 'GET',
})
  .validator((input: { range: DateRange }) => input)
  .handler(async ({ data: input }) => {
  const selectedRange = input.range
  const currentDate = new Date()
  const asOfDate = selectedRange === 'yesterday' ? subDays(currentDate, 1) : currentDate
  const asOf = format(asOfDate, 'yyyy-MM-dd')
  const from = format(subDays(asOfDate, rangeDays[selectedRange] - 1), 'yyyy-MM-dd')
  const to = asOf
  const admin = getSupabaseAdmin()
  const pageSize = 1000

  async function loadTaskPages(completed: boolean, completedFrom?: string) {
    const rows: ForthDbRow[] = []
    for (let start = 0; ; start += pageSize) {
      let query = admin
        .from('forth_tasks')
        .select('*')
        .eq('task_completed', completed)
        .range(start, start + pageSize - 1)
      if (completedFrom) query = query.gte('task_completed_date', completedFrom)
      const { data: page, error: pageError } = await query
      if (pageError) throw pageError
      rows.push(...(page as ForthDbRow[]))
      if (!page || page.length < pageSize) break
    }
    return rows
  }

  async function loadCreatedTaskPages() {
    const rows: ForthDbRow[] = []
    for (let start = 0; ; start += pageSize) {
      const { data: page, error: pageError } = await admin
        .from('forth_tasks')
        .select('*')
        .gte('task_created_date', from)
        .lte('task_created_date', to)
        .range(start, start + pageSize - 1)
      if (pageError) throw pageError
      rows.push(...(page as ForthDbRow[]))
      if (!page || page.length < pageSize) break
    }
    return rows
  }

  let data: ForthDbRow[] = []
  let error: { message: string } | null = null
  const [{ data: allUsers, error: usersError }, tasksResult] = await Promise.all([
    admin.from('forth_users').select('id, firstname, lastname, role_name, active'),
    Promise.all([
      loadTaskPages(false),
      loadTaskPages(true, from),
      loadCreatedTaskPages(),
    ]).catch((taskError: { message?: string }) => {
      error = { message: taskError.message ?? String(taskError) }
      return [[], [], []] as ForthDbRow[][]
    }),
  ])
  const users = (allUsers ?? []).filter((user) => {
    const role = String(user.role_name ?? '').trim().toLowerCase()
    return user.active !== false && (role === 'client services' || role === 'cls')
  })
  const clientServicesIds = new Set(users.map((user) => user.id))
  data = [...tasksResult[0], ...tasksResult[1]].filter((task) => clientServicesIds.has(task.user_id))
  const createdCounts = new Map<string, number>()
  for (const task of tasksResult[2].filter((row) => clientServicesIds.has(row.user_id))) {
    if (!task.task_created_date) continue
    const key = `${task.user_id}:${task.task_created_date}`
    createdCounts.set(key, (createdCounts.get(key) ?? 0) + 1)
  }
  const assignedDates = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => ({
    date: format(date, 'yyyy-MM-dd'),
    label: format(date, rangeDays[selectedRange] > 14 ? 'MMM d' : 'EEE, MMM d'),
  }))
  const assignedByAgent = users.map((user) => {
    const days = assignedDates.map((day) => ({
      ...day,
      assigned: createdCounts.get(`${user.id}:${day.date}`) ?? 0,
    }))
    const total = days.reduce((sum, day) => sum + day.assigned, 0)
    return {
      userId: user.id,
      name: `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim(),
      total,
      average: days.length ? total / days.length : 0,
      days,
    }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  if (error && /Could not find the table 'public\.forth_tasks'/i.test(error.message)) {
    return {
      asOf,
      from,
      to,
      range: selectedRange,
      open: 0,
      overdue: 0,
      completed: 0,
      agents: 0,
      avgOverdue: 0,
      aboveAverage: 0,
      source: 'none' as const,
      message: 'forth_tasks table not found. Apply the Supabase migration to load CRM data.',
      rows: [],
      assignedByAgent: [],
    }
  }

  if (error) throw new Error(`Failed to load Forth tasks: ${error.message}`)
  if (usersError && !/Could not find the table 'public\.forth_users'/i.test(usersError.message)) {
    throw new Error(`Failed to load Forth users: ${usersError.message}`)
  }

  const tasks = (data ?? []).map(rowToTask)
  const reportByUser = new Map(
    computeForthReport(tasks, asOf, from, to).map((row) => [row.userId, row]),
  )
  for (const user of users ?? []) {
    if (!reportByUser.has(user.id)) {
      reportByUser.set(user.id, {
        userId: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        open: 0,
        overdue: 0,
        done: 0,
      })
    }
  }
  const report = Array.from(reportByUser.values())

  const totalOpen = report.reduce((sum, r) => sum + r.open, 0)
  const totalOverdue = report.reduce((sum, r) => sum + r.overdue, 0)
  const totalDone = report.reduce((sum, r) => sum + r.done, 0)
  const avgOverdue = report.length ? totalOverdue / report.length : 0
  const aboveAverage = report.filter((r) => r.overdue > avgOverdue).length

  return {
    asOf,
    from,
    to,
    range: selectedRange,
    open: totalOpen,
    overdue: totalOverdue,
    completed: totalDone,
    agents: report.length,
    avgOverdue,
    aboveAverage,
    source: tasks.length === 0 ? 'none' : 'db',
    assignedByAgent,
    rows: report.sort((a, b) =>
      b.overdue - a.overdue ||
      b.open - a.open ||
      `${a.firstname} ${a.lastname}`.localeCompare(`${b.firstname} ${b.lastname}`),
    ),
  }
})

export const Route = createFileRoute('/crm')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: isDateRange(search.range) ? search.range : 'today' as DateRange,
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  component: CrmPage,
  loader: async ({ deps }) => await getCrmReport({ data: { range: deps.range } }),
})

function CrmPage() {
  const data = Route.useLoaderData()
  const { range } = Route.useSearch()
  const navigate = useNavigate({ from: '/crm' })

  return (
    <div className="space-y-4 font-manrope">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiBox label="OPEN" value={data.open} />
        <KpiBox label="OVERDUE" value={data.overdue} accent />
        <KpiBox label="COMPLETED" value={data.completed} />
        <KpiBox label="AGENTS" value={data.agents} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-card p-6 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-sora text-sm font-bold text-ink">AGENT TASKS</h2>
              <p className="text-xs text-muted">Client Services (CLS) follow-ups against the team average</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['today', 'TODAY'],
                ['yesterday', 'YESTERDAY'],
                ['7d', '7D'],
                ['14d', '14D'],
                ['30d', '30D'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => navigate({ search: { range: value } })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold hover:bg-ink/5 ${
                    range === value ? 'border-ink bg-ink text-paper' : 'border-ink/10 text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-full bg-accent/10 px-3 py-2 text-xs text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {data.aboveAverage} agents above the team overdue average ({data.avgOverdue.toFixed(1)})
          </div>

          <p className="mt-4 text-right text-xs font-semibold text-ink">
            OVERDUE AS OF {data.asOf}
          </p>

          <div className="mt-4 space-y-3">
            {data.rows.map((row) => {
              const total = row.open + row.overdue + row.done
              const overduePct = total ? (row.overdue / total) * 100 : 0
              const openPct = total ? (row.open / total) * 100 : 0
              const completedPct = total ? (row.done / total) * 100 : 0
              return (
                <div key={row.userId}>
                  <div className="flex items-start justify-between gap-4 text-xs">
                    <span className="font-semibold text-ink">{row.firstname} {row.lastname}</span>
                    <div className="text-right text-muted">
                      <p>{row.overdue} overdue · {row.open} open · {row.done} completed</p>
                      <p className="mt-0.5">
                        <span className="text-accent">{overduePct.toFixed(1)}% overdue</span>
                        {' · '}
                        <span className="font-semibold text-ink">{completedPct.toFixed(1)}% completed</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full bg-accent" style={{ width: `${overduePct}%` }} />
                    <div className="h-full bg-ink/30" style={{ width: `${openPct}%` }} />
                    <div className="h-full bg-ink" style={{ width: `${completedPct}%` }} />
                  </div>
                </div>
              )
            })}
            {data.rows.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">
                {data.message ? data.message : data.source === 'none' ? 'No Forth data synced yet.' : 'No open or overdue tasks found.'}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-6 shadow-sm">
            <h2 className="font-sora text-sm font-bold text-ink">CRM CONNECTION</h2>
            <p className="text-xs text-muted">Check the API link</p>
            <p className="mt-2 text-xs text-muted">
              {data.source === 'none' ? 'No synced tasks in the database.' : `Loaded from ${data.agents} agents.`}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="font-sora text-sm font-bold text-ink">DAILY TASKS ASSIGNED — CRM</h2>
        <p className="text-xs text-muted">Tasks assigned to each Client Services agent per day</p>
        {data.assignedByAgent.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-max text-left text-xs">
              <thead className="border-b border-ink/10 text-muted">
                <tr>
                  <th className="sticky left-0 bg-card px-3 py-2 font-semibold">AGENT</th>
                  {data.assignedByAgent[0]?.days.map((day) => (
                    <th key={day.date} className="px-3 py-2 text-center font-semibold">{day.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">TOTAL</th>
                  <th className="px-3 py-2 text-right font-semibold">AVG/DAY</th>
                </tr>
              </thead>
              <tbody>
                {data.assignedByAgent.map((agent) => (
                  <tr key={agent.userId} className="border-b border-ink/10 last:border-0">
                    <td className="sticky left-0 bg-card px-3 py-3 font-semibold text-ink">{agent.name}</td>
                    {agent.days.map((day) => (
                      <td key={day.date} className="px-3 py-3 text-center text-ink">{day.assigned}</td>
                    ))}
                    <td className="px-3 py-3 text-right font-bold text-ink">{agent.total}</td>
                    <td className="px-3 py-3 text-right text-muted">{agent.average.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted">No Client Services agents found.</p>
        )}
      </div>
    </div>
  )
}

function KpiBox({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`mt-1 font-sora text-4xl font-bold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

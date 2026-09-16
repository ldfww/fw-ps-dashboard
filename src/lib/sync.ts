import { format } from 'date-fns'
import { fetchViciDialStats } from './vicidial'
import { computeForthReport, pullForthTasks, today } from './forth'
import { fetchGmailCountsForDay } from './gmail'
import { fetchSheetTasks, fetchSalesClosingRecords, type SalesClosingRecord } from './sheets'
import { getSupabaseAdmin } from './supabase'
import { insertAlerts } from './alerts'

export interface SnapshotRow {
  snapshot_date: string
  source: string
  agent_id: string | null
  metric: string
  value: number
}

async function snapshotVici(date: string, userGroup: string | null): Promise<SnapshotRow[]> {
  const rows = await fetchViciDialStats(date, userGroup)
  const result: SnapshotRow[] = []
  for (const r of rows) {
    result.push({ snapshot_date: date, source: 'vici', agent_id: r.agent_id, metric: 'talk_time', value: r.talk_time_secs })
    result.push({ snapshot_date: date, source: 'vici', agent_id: r.agent_id, metric: 'wait_time', value: r.wait_time_secs })
    result.push({ snapshot_date: date, source: 'vici', agent_id: r.agent_id, metric: 'pause_time', value: r.pause_time_secs })
    result.push({ snapshot_date: date, source: 'vici', agent_id: r.agent_id, metric: 'calls', value: r.calls })
  }
  return result
}

function mapForthTaskToDb(t: { id: string; userId: string; firstname?: string; lastname?: string; user_name?: string; title?: string; task_note?: string; task_due_date?: string; task_status?: string; task_completed: boolean; task_completed_date?: string; task_created_date?: string }) {
  return {
    id: t.id,
    user_id: t.userId,
    firstname: t.firstname ?? '',
    lastname: t.lastname ?? '',
    user_name: t.user_name ?? '',
    title: t.title ?? '',
    task_note: t.task_note ?? '',
    task_due_date: t.task_due_date ?? null,
    task_status: t.task_status ?? '',
    task_completed: t.task_completed,
    task_completed_date: t.task_completed_date ?? null,
    task_created_date: t.task_created_date ?? null,
  }
}

async function snapshotForth(date: string): Promise<{ rows: SnapshotRow[]; report: ReturnType<typeof computeForthReport> }> {
  const apiKey = process.env.FORTH_API_KEY
  if (!apiKey) throw new Error('FORTH_API_KEY is not configured')
  const { users, allTasks } = await pullForthTasks(apiKey)

  const admin = getSupabaseAdmin()
  if (users.length > 0) {
    const { error } = await admin
      .from('forth_users')
      .upsert(users.map((user) => ({
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        user_name: user.user_name ?? '',
        role_name: user.role_name ?? '',
        active: user.active,
      })), { onConflict: 'id' })
    if (error) throw new Error(`forth_users upsert failed: ${error.message}`)
  }

  if (allTasks.length > 0) {
    // forth_tasks.id is the primary key (a task can only belong to one user at a time
    // in Forth), so dedupe by id before upserting in case a reassigned task was pulled
    // under more than one user during this run.
    const byId = new Map(allTasks.map((t) => [t.id, t]))
    const { error } = await admin
      .from('forth_tasks')
      .upsert(Array.from(byId.values()).map(mapForthTaskToDb), { onConflict: 'id' })
    if (error) throw new Error(`forth_tasks upsert failed: ${error.message}`)
  }

  const report = computeForthReport(allTasks, date, date, date)
  const rows: SnapshotRow[] = []
  for (const r of report) {
    const agentId = `${r.firstname ?? ''} ${r.lastname ?? ''}`.trim() || r.userId
    rows.push({ snapshot_date: date, source: 'forth', agent_id: agentId, metric: 'overdue', value: r.overdue })
    rows.push({ snapshot_date: date, source: 'forth', agent_id: agentId, metric: 'done', value: r.done })
  }
  return { rows, report }
}

async function snapshotGmail(date: string): Promise<SnapshotRow[]> {
  const count = await fetchGmailCountsForDay(date)
  return [
    { snapshot_date: date, source: 'gmail', agent_id: null, metric: 'received', value: count.received },
    { snapshot_date: date, source: 'gmail', agent_id: null, metric: 'opened', value: count.opened },
    { snapshot_date: date, source: 'gmail', agent_id: null, metric: 'unopened', value: count.unopened },
  ]
}

async function snapshotSheets(date: string): Promise<{ snapshot: SnapshotRow[]; sales: SalesClosingRecord[] }> {
  const [tasks, sales] = await Promise.all([
    fetchSheetTasks().catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      if (/not (?:set|configured)|must be set/i.test(message)) return []
      throw err
    }),
    fetchSalesClosingRecords().catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      if (/not (?:set|configured)|must be set/i.test(message)) return []
      throw err
    }),
  ])

  const snapshot: SnapshotRow[] = tasks
    .filter((r) => r.log_date === date)
    .map((r) => ({
      snapshot_date: date,
      source: 'sheets',
      agent_id: r.agent_id,
      metric: 'tasks_assigned',
      value: r.tasks_assigned,
    }))

  return { snapshot, sales }
}

function mapSalesRecordToDb(r: SalesClosingRecord) {
  return {
    date_range: r.date_range,
    start_date: r.start_date,
    end_date: r.end_date,
    agent_id: r.agent_id,
    is_total: r.is_total,
    booked_sales: r.booked_sales,
    paid_sales: r.paid_sales,
    red_nsf: r.red_nsf,
    gray_pending_cancel: r.gray_pending_cancel,
    closing_ratio: r.closing_ratio,
    cancelled_clients: r.cancelled_clients,
    white_scheduled: r.white_scheduled,
  }
}

async function safeSnapshot<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/not (?:set|configured)|must be set/i.test(message)) return null
    console.warn('Sync source failed (continuing without it):', message)
    return null
  }
}

export async function syncAll(
  date = today(),
  userGroup: string | null = null,
): Promise<{ vici: number; forth: number; gmail: number; sheets: number; sales: number }> {
  const admin = getSupabaseAdmin()

  const [vici, forth, gmail, sheets] = await Promise.all([
    safeSnapshot(() => snapshotVici(date, userGroup)).then((r) => r ?? []),
    safeSnapshot(() => snapshotForth(date)).then((r) => r ?? { rows: [], report: [] }),
    safeSnapshot(() => snapshotGmail(date)).then((r) => r ?? []),
    safeSnapshot(() => snapshotSheets(date)).then((r) => r ?? { snapshot: [], sales: [] }),
  ])

  const all = [...vici, ...forth.rows, ...gmail, ...sheets.snapshot]

  if (all.length > 0) {
    const { error } = await admin
      .from('report_snapshots')
      .upsert(all, { onConflict: 'snapshot_date, source, agent_id, metric' })
    if (error) throw new Error(`Snapshot upsert failed: ${error.message}`)
  }

  if (sheets.sales.length > 0) {
    const { error: salesError } = await admin
      .from('sales_closing_records')
      .upsert(sheets.sales.map(mapSalesRecordToDb), { onConflict: 'date_range, agent_id, is_total' })
    if (salesError) throw new Error(`Sales closing records upsert failed: ${salesError.message}`)
  }

  const overdueThreshold = Number(process.env.THRESHOLD_OVERDUE) || 30
  const alertRows = forth.report
    .filter((r) => r.overdue > overdueThreshold)
    .map((r) => ({
      agent_id: `${r.firstname ?? ''} ${r.lastname ?? ''}`.trim() || r.userId,
      source: 'forth',
      metric: 'overdue',
      threshold: overdueThreshold,
      observed: r.overdue,
    }))
  if (alertRows.length > 0) {
    await insertAlerts(alertRows)
  }

  return {
    vici: vici.length,
    forth: forth.rows.length,
    gmail: gmail.length,
    sheets: sheets.snapshot.length,
    sales: sheets.sales.length,
  }
}

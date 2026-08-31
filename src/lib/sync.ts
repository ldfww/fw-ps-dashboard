import { format } from 'date-fns'
import { fetchViciDialStats } from './vicidial'
import { computeForthReport, pullForthTasks, today } from './forth'
import { fetchGmailCountsForDay } from './gmail'
import { fetchSheetTasks } from './sheets'
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

async function snapshotForth(date: string): Promise<{ rows: SnapshotRow[]; report: ReturnType<typeof computeForthReport> }> {
  const apiKey = process.env.FORTH_API_KEY
  if (!apiKey) throw new Error('FORTH_API_KEY is not configured')
  const { allTasks } = await pullForthTasks(apiKey)
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

async function snapshotSheets(date: string): Promise<SnapshotRow[]> {
  const rows = await fetchSheetTasks()
  return rows
    .filter((r) => r.log_date === date)
    .map((r) => ({
      snapshot_date: date,
      source: 'sheets',
      agent_id: r.agent_id,
      metric: 'tasks_assigned',
      value: r.tasks_assigned,
    }))
}

export async function syncAll(
  date = today(),
  userGroup: string | null = null,
): Promise<{ vici: number; forth: number; gmail: number; sheets: number }> {
  const admin = getSupabaseAdmin()

  const [vici, forth, gmail, sheets] = await Promise.all([
    snapshotVici(date, userGroup),
    snapshotForth(date),
    snapshotGmail(date),
    snapshotSheets(date),
  ])

  const all = [...vici, ...forth.rows, ...gmail, ...sheets]
  if (all.length === 0) {
    throw new Error('No data returned from any source for the snapshot')
  }

  const { error } = await admin
    .from('report_snapshots')
    .upsert(all, { onConflict: 'snapshot_date, source, agent_id, metric' })
  if (error) throw new Error(`Snapshot upsert failed: ${error.message}`)

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
  await insertAlerts(alertRows)

  return {
    vici: vici.length,
    forth: forth.rows.length,
    gmail: gmail.length,
    sheets: sheets.length,
  }
}

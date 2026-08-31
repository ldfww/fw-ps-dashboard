import { getSupabaseAdmin } from './supabase'

export interface AlertInput {
  agent_id: string
  source: string
  metric: string
  threshold: number
  observed: number
}

export async function insertAlerts(
  alerts: AlertInput[],
): Promise<void> {
  if (alerts.length === 0) return
  const admin = getSupabaseAdmin()
  const { error } = await admin.from('threshold_alerts').insert(
    alerts.map((a) => ({
      agent_id: a.agent_id,
      source: a.source,
      metric: a.metric,
      threshold: a.threshold,
      observed: a.observed,
    })),
  )
  if (error) throw new Error(`Threshold alert insert failed: ${error.message}`)
}

export async function getThresholdAlerts(limit = 50) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('threshold_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Threshold alert query failed: ${error.message}`)
  return data ?? []
}

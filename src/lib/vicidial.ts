export interface ViciDialStatsRow {
  agent_id: string
  agent_name: string
  user_group: string
  entry_date: string
  talk_time_secs: number
  wait_time_secs: number
  pause_time_secs: number
  break_time_secs: number
  lunch_time_secs: number
  login_time_secs: number
  calls: number
}

export interface ViciDialRange {
  from: string
  to: string
}

export interface ViciDialInboundDrop {
  group: string
  total_calls: number
  answered_calls: number
  drop_calls: number
}

export interface ViciDialCampaign {
  campaign_id: string
  campaign_name: string
  active: string
  user_group: string
}

function parseTimeToSeconds(value: string | undefined): number {
  if (!value) return 0
  const trimmed = value.trim()
  const asNumber = Number(trimmed)
  if (!Number.isNaN(asNumber)) return asNumber

  const parts = trimmed.split(':').map(Number)
  if (parts.length === 3) {
    const [h, m, s] = parts
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
  }
  if (parts.length === 2) {
    const [m, s] = parts
    return (m || 0) * 60 + (s || 0)
  }
  return 0
}

function parseInteger(value: string | undefined): number {
  if (!value) return 0
  const n = Number(value.trim())
  return Number.isNaN(n) ? 0 : n
}

function parsePipeBody(text: string, entryDate: string): ViciDialStatsRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  const hasHeader = lines[0].toLowerCase().includes('user') || lines[0].toLowerCase().includes('full_name')
  const data = hasHeader ? lines.slice(1) : lines
  if (data.length === 0) return []

  const header = hasHeader ? lines[0].split('|') : []
  const rows: ViciDialStatsRow[] = []

  for (const line of data) {
    const parts = line.split('|')
    if (parts.length < 4) continue

    const get = (name: string) => {
      if (header.length === 0) return undefined
      const idx = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
      return idx >= 0 ? parts[idx] : undefined
    }

    const agent_id = header.length ? (get('user') ?? parts[0]) : parts[0]
    const agent_name = header.length ? (get('full_name') ?? parts[1]) : parts[1]
    const user_group = header.length ? (get('user_group') ?? parts[2]) : parts[2]

    const calls = header.length ? (get('calls') ?? parts[3]) : parts[3]
    const talk_time = get('talk_time') ?? parts[17]
    const wait_time = get('wait_time') ?? parts[16]
    const pause_time = get('pause_time') ?? parts[9]
    const login_time = get('login_time') ?? parts[4]

    rows.push({
      agent_id: agent_id.trim(),
      agent_name: agent_name.trim(),
      user_group: user_group.trim(),
      entry_date: entryDate,
      talk_time_secs: parseTimeToSeconds(talk_time),
      wait_time_secs: parseTimeToSeconds(wait_time),
      pause_time_secs: parseTimeToSeconds(pause_time),
      break_time_secs: 0,
      lunch_time_secs: 0,
      login_time_secs: parseTimeToSeconds(login_time),
      calls: parseInteger(calls),
    })
  }

  return rows
}

interface PauseCodeTimes {
  break_time_secs: number
  lunch_time_secs: number
}

async function fetchViciDialTimeDetail(
  from: string,
  to: string,
  userGroup: string | null,
): Promise<Map<string, PauseCodeTimes>> {
  const user = process.env.VICIDIAL_USER
  const pass = process.env.VICIDIAL_PASS
  if (!user || !pass) return new Map()

  const params = new URLSearchParams({
    DB: '0',
    query_date: from,
    end_date: to,
    'user_group[]': userGroup ?? '--ALL--',
    'group[]': '--ALL--',
    shift: 'ALL',
    file_download: '1',
  } as Record<string, string>)

  const res = await fetch(
    `https://fws.phdialer.com/vicidial/AST_agent_time_detail.php?${params.toString()}`,
    {
      headers: {
        Authorization: 'Basic ' + btoa(`${user}:${pass}`),
      },
    },
  )
  if (!res.ok) {
    console.warn(`ViciDial time detail request failed: ${res.status}`)
    return new Map()
  }

  const text = await res.text()
  const lines = text.split(/\r?\n/)
  const headerIdx = lines.findIndex((line) => line.trim().startsWith('USER,'))
  if (headerIdx === -1) return new Map()

  const headers = lines[headerIdx].split(',').map((h) => h.trim().toLowerCase())
  const userIdx = headers.indexOf('user')
  const breakIdx = headers.indexOf('break')
  const lunchIdx = headers.indexOf('lunch')

  const result = new Map<string, PauseCodeTimes>()
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(',')
    if (userIdx === -1 || parts.length <= userIdx) continue
    const key = parts[userIdx].trim().toLowerCase()
    const breakTime = breakIdx >= 0 ? parts[breakIdx] : undefined
    const lunchTime = lunchIdx >= 0 ? parts[lunchIdx] : undefined
    result.set(key, {
      break_time_secs: parseTimeToSeconds(breakTime),
      lunch_time_secs: parseTimeToSeconds(lunchTime),
    })
  }
  return result
}

export async function fetchViciDialStats(
  date: string,
  userGroup: string | null,
): Promise<ViciDialStatsRow[]> {
  const user = process.env.VICIDIAL_USER
  const pass = process.env.VICIDIAL_PASS
  if (!user || !pass) {
    throw new Error('VICIDIAL_USER and VICIDIAL_PASS must be set')
  }

  const start = `${date} 00:00:00`
  const end = `${date} 23:59:59`
  const params = new URLSearchParams({
    source: 'ops-dashboard',
    function: 'agent_stats_export',
    user,
    pass,
    stage: 'pipe',
    header: 'YES',
    time_format: 'S',
    datetime_start: start,
    datetime_end: end,
  })
  if (userGroup) {
    params.set('user_group', userGroup)
  }

  const res = await fetch(`https://fws.phdialer.com/vicidial/non_agent_api.php?${params.toString()}`, {
    method: 'GET',
  })
  if (!res.ok) {
    throw new Error(`ViciDial request failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const text = await res.text()
  if (!text || text.toLowerCase().includes('error')) {
    throw new Error(`ViciDial returned an error: ${text.slice(0, 200)}`)
  }

  const rows = parsePipeBody(text, date)
  const pauseTimes = await fetchViciDialTimeDetail(date, date, userGroup)
  for (const row of rows) {
    const extra = pauseTimes.get(row.agent_name.toLowerCase()) ?? pauseTimes.get(row.agent_id.toLowerCase())
    row.break_time_secs = extra?.break_time_secs ?? 0
    row.lunch_time_secs = extra?.lunch_time_secs ?? 0
  }
  return rows
}

export async function syncViciDialRange(
  from: string,
  to: string,
  userGroup: string | null,
): Promise<ViciDialStatsRow[]> {
  const results: ViciDialStatsRow[] = []
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    const dayRows = await fetchViciDialStats(date, userGroup)
    results.push(...dayRows)
  }
  return results
}

function parseStatusBreakdown(statusField: string | undefined, targetStatus: string): number {
  if (!statusField) return 0
  const pairs = statusField.split(',').map((p) => p.trim())
  let total = 0
  for (const pair of pairs) {
    const [status, count] = pair.split('-')
    if (status?.trim().toUpperCase() === targetStatus.toUpperCase()) {
      total += parseInteger(count)
    }
  }
  return total
}

const NON_ANSWERED_STATUSES = new Set([
  'DROP',
  'XDROP',
  'B',
  'BUSY',
  'TIMEOT',
  'TIMEOUT',
  'TO',
  'ABANDON',
  'ABDN',
  'NOANSWER',
  'NOANS',
  'NOANSW',
])

function parseNonAnsweredCount(statusField: string | undefined): number {
  if (!statusField) return 0
  const pairs = statusField.split(',').map((p) => p.trim())
  let total = 0
  for (const pair of pairs) {
    const [status, count] = pair.split('-')
    if (status?.trim().toUpperCase() && NON_ANSWERED_STATUSES.has(status.trim().toUpperCase())) {
      total += parseInteger(count)
    }
  }
  return total
}

function parseCallStatusStats(text: string): ViciDialInboundDrop[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  const isHeader = (line: string) =>
    line.toLowerCase().includes('campaign') ||
    line.toLowerCase().includes('ingroup') ||
    line.toLowerCase().includes('total calls') ||
    line.toLowerCase().includes('status breakdown')

  const data = isHeader(lines[0]) ? lines.slice(1) : lines
  const rows: ViciDialInboundDrop[] = []

  for (const line of data) {
    const parts = line.split('|')
    if (parts.length < 5) continue

    const group = parts[0].trim()
    const totalCalls = parseInteger(parts[1])
    const nonAnswered = parseNonAnsweredCount(parts[4])
    const dropCalls = parseStatusBreakdown(parts[4], 'DROP')
    const answeredCalls = Math.max(0, totalCalls - nonAnswered)

    if (!group) continue
    rows.push({ group, total_calls: totalCalls, answered_calls: answeredCalls, drop_calls: dropCalls })
  }

  return rows
}

export async function fetchCampaignsList(): Promise<ViciDialCampaign[]> {
  const user = process.env.VICIDIAL_USER
  const pass = process.env.VICIDIAL_PASS
  if (!user || !pass) {
    throw new Error('VICIDIAL_USER and VICIDIAL_PASS must be set')
  }

  const params = new URLSearchParams({
    source: 'ops-dashboard',
    function: 'campaigns_list',
    user,
    pass,
    stage: 'pipe',
    header: 'YES',
  })

  const res = await fetch(`https://fws.phdialer.com/vicidial/non_agent_api.php?${params.toString()}`, {
    method: 'GET',
  })
  if (!res.ok) {
    throw new Error(`ViciDial campaigns_list request failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const text = await res.text()
  if (!text || text.toLowerCase().startsWith('error')) {
    throw new Error(`ViciDial campaigns_list returned an error: ${text.slice(0, 200)}`)
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const isHeader = lines[0]?.toLowerCase().includes('campaign_id')
  const data = isHeader ? lines.slice(1) : lines

  const rows: ViciDialCampaign[] = []
  for (const line of data) {
    const parts = line.split('|')
    if (parts.length < 5) continue
    rows.push({
      campaign_id: parts[0].trim(),
      campaign_name: parts[1].trim(),
      active: parts[2].trim(),
      user_group: parts[3].trim(),
    })
  }
  return rows.sort((a, b) => a.campaign_id.localeCompare(b.campaign_id))
}

export async function fetchInboundGroupDrops(
  date: string,
  campaign: string | null,
): Promise<ViciDialInboundDrop[]> {
  const user = process.env.VICIDIAL_USER
  const pass = process.env.VICIDIAL_PASS
  if (!user || !pass) {
    throw new Error('VICIDIAL_USER and VICIDIAL_PASS must be set')
  }

  const params = new URLSearchParams({
    source: 'ops-dashboard',
    function: 'call_status_stats',
    user,
    pass,
    campaigns: campaign ?? '---ALL---',
    query_date: date,
    stage: 'pipe',
    header: 'YES',
  })

  const res = await fetch(`https://fws.phdialer.com/vicidial/non_agent_api.php?${params.toString()}`, {
    method: 'GET',
  })
  if (!res.ok) {
    throw new Error(`ViciDial call_status_stats request failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const text = await res.text()
  if (!text || text.toLowerCase().startsWith('error')) {
    throw new Error(`ViciDial call_status_stats returned an error: ${text.slice(0, 200)}`)
  }

  return parseCallStatusStats(text)
}

export async function syncInboundGroupDropsRange(
  from: string,
  to: string,
  campaign: string | null,
): Promise<ViciDialInboundDrop[]> {
  const byGroup = new Map<string, ViciDialInboundDrop>()
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    const dayRows = await fetchInboundGroupDrops(date, campaign)
    for (const row of dayRows) {
      const current = byGroup.get(row.group)
      if (!current) {
        byGroup.set(row.group, { ...row })
        continue
      }
      current.total_calls += row.total_calls
      current.answered_calls += row.answered_calls
      current.drop_calls += row.drop_calls
    }
  }
  return Array.from(byGroup.values()).sort((a, b) => b.drop_calls - a.drop_calls || a.group.localeCompare(b.group))
}

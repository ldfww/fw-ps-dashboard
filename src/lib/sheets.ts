import { format, parse } from 'date-fns'
import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

export interface SheetTaskRow {
  agent_id: string
  log_date: string
  tasks_assigned: number
}

export interface MasterMasterRecord {
  date: string
  active_clients: number
  reschedule: number
  nsf_recurring: number
  cancels: number
  poc: number
  paid_retention: number
  sales: number
  fp_paid: number
  fp_nsf: number
  fp_gray: number
  fp_ratio: number
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export interface CancelMasterBucket {
  bucket: string
  request: number
  poc: number
  loss: number
  paid_retained: number
  retained_ratio: number
}

export interface CancelMasterRecord {
  month: string
  buckets: CancelMasterBucket[]
  total: CancelMasterBucket
}

export interface NsfMasterCategory {
  category: string
  amount: number
  count: number
}

export interface NsfMasterRecord {
  month: string
  categories: NsfMasterCategory[]
  total_revenue_lost: number
  total_revenue_recouped: number
}

export interface SalesClosingRecord {
  date_range: string
  start_date: string | null
  end_date: string | null
  agent_id: string
  is_total: boolean
  booked_sales: number
  paid_sales: number
  red_nsf: number
  gray_pending_cancel: number
  closing_ratio: number
  cancelled_clients: number
  white_scheduled: number
}

function getEnv() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }
  return { clientEmail, privateKey, spreadsheetId }
}

function createAuth(clientEmail: string, privateKey: string) {
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

function parseRatio(value: unknown): number {
  if (value === null || value === undefined) return 0
  const s = String(value).replace('%', '').trim()
  const n = Number(s)
  return Number.isNaN(n) ? 0 : n
}

function parseMonth(month: string): number {
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  return months[month.toLowerCase()] ?? -1
}

function parseDateRange(range: string): { start_date: string | null; end_date: string | null } {
  const match = range.match(/([A-Za-z]{3})\s+(\d{1,2})\s+to\s+([A-Za-z]{3})\s+(\d{1,2})/)
  if (!match) return { start_date: null, end_date: null }
  const startMonth = parseMonth(match[1])
  const startDay = Number(match[2])
  const endMonth = parseMonth(match[3])
  const endDay = Number(match[4])
  if (startMonth === -1 || endMonth === -1 || Number.isNaN(startDay) || Number.isNaN(endDay)) {
    return { start_date: null, end_date: null }
  }
  const year = new Date().getFullYear()
  const start = new Date(year, startMonth, startDay)
  const end = new Date(year, endMonth, endDay)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start_date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end_date: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

export async function fetchSheetTasks(): Promise<SheetTaskRow[]> {
  const { clientEmail, privateKey, spreadsheetId } = getEnv()
  const auth = createAuth(clientEmail, privateKey)
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:Z1000',
    })

    const rows = res.data.values
    if (!rows || rows.length < 2) return []

    const headers = rows[0].map((h: string) => h.toLowerCase().trim())
    const agentIdx = headers.indexOf('agent')
    const dateIdx = headers.indexOf('date')
    const tasksIdx = headers.indexOf('tasks_assigned')

    if (agentIdx === -1 || dateIdx === -1 || tasksIdx === -1) {
      console.warn('Sheet must contain agent, date and tasks_assigned columns')
      return []
    }

    const result: SheetTaskRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const agent = String(row[agentIdx] ?? '').trim()
      const date = String(row[dateIdx] ?? '').trim()
      const tasks = parseNumber(row[tasksIdx])
      if (!agent || !date) continue
      result.push({ agent_id: agent, log_date: date, tasks_assigned: tasks })
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Google Sheets tasks read failed:', message)
    return []
  }
}

export async function fetchSalesClosingRecords(): Promise<SalesClosingRecord[]> {
  const { clientEmail, privateKey, spreadsheetId } = getEnv()
  const auth = createAuth(clientEmail, privateKey)
  const sheets = google.sheets({ version: 'v4', auth })
  let rows: unknown[][] | undefined
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'results!A1:Z1000',
    })
    rows = res.data.values
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Google Sheets sales read failed:', message)
    return []
  }

  if (!rows || rows.length < 2) return []

  // The sheet may have a title row above the actual headers; locate the header row
  // by requiring multiple expected headers to be present.
  const headerRowIndex = rows.findIndex((row) => {
    const values = row.map((cell: unknown) => String(cell ?? '').toLowerCase().trim())
    const hasAgent = values.some((v) => v === 'agent' || v.includes('agents')) && values.some((v) => v.includes('booked'))
    const hasDateRangeAndBooked = values.some((v) => v.includes('date') && v.includes('range')) && values.some((v) => v.includes('booked'))
    return hasAgent || hasDateRangeAndBooked
  })
  if (headerRowIndex === -1) return []

  const headers = rows[headerRowIndex].map((h: string) => String(h).toLowerCase().trim().replace(/[\(\)\/]/g, ' '))
  const dateRangeIdx = headers.findIndex((h) => h.includes('date') && h.includes('range'))
  const agentIdx = headers.findIndex((h) => h === 'agent')
  const bookedIdx = headers.findIndex((h) => h.includes('booked'))
  const paidIdx = headers.findIndex((h) => h.includes('paid') || h.includes('green'))
  const redIdx = headers.findIndex((h) => h.includes('red') || h.includes('nsf'))
  const grayIdx = headers.findIndex((h) => h.includes('gray') || h.includes('pending'))
  const ratioIdx = headers.findIndex((h) => h.includes('closing') || h.includes('ratio'))
  const cancelledIdx = headers.findIndex((h) => h.includes('cancelled'))
  const whiteIdx = headers.findIndex((h) => h.includes('white') || h.includes('scheduled'))

  const result: SalesClosingRecord[] = []
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const dateRange = dateRangeIdx === -1 ? '' : String(row[dateRangeIdx] ?? '').trim()
    const agent = agentIdx === -1 ? '' : String(row[agentIdx] ?? '').trim()
    const firstCol = String(row[0] ?? '').toLowerCase().trim()
    const isTotal = firstCol === 'total' || agent.toLowerCase() === 'total' || dateRange.toLowerCase() === 'total'
    if (!isTotal && !agent) continue

    const { start_date, end_date } = parseDateRange(isTotal && !dateRange ? agent : dateRange)
    result.push({
      date_range: dateRange,
      start_date,
      end_date,
      agent_id: isTotal ? 'TOTAL' : agent,
      is_total: isTotal,
      booked_sales: parseNumber(row[bookedIdx]),
      paid_sales: parseNumber(row[paidIdx]),
      red_nsf: parseNumber(row[redIdx]),
      gray_pending_cancel: parseNumber(row[grayIdx]),
      closing_ratio: parseRatio(row[ratioIdx]),
      cancelled_clients: parseNumber(row[cancelledIdx]),
      white_scheduled: parseNumber(row[whiteIdx]),
    })
  }

  return result
}

export function aggregateSalesClosingRecords(records: SalesClosingRecord[]) {
  const total = records.find((r) => r.is_total)
  const agents = records.filter((r) => !r.is_total)
  return {
    total: total ?? {
      date_range: '',
      start_date: null,
      end_date: null,
      agent_id: 'TOTAL',
      is_total: true,
      booked_sales: 0,
      paid_sales: 0,
      red_nsf: 0,
      gray_pending_cancel: 0,
      closing_ratio: 0,
      cancelled_clients: 0,
      white_scheduled: 0,
    },
    agents,
    dateRange: total?.date_range ?? agents[0]?.date_range ?? '',
  }
}

function getMasterEnv() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SHEETS_MASTER_SPREADSHEET_ID
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_MASTER_SPREADSHEET_ID must be set')
  }
  const range = process.env.GOOGLE_SHEETS_MASTER_RANGE?.trim() || 'Results!A1:L1000'
  return { clientEmail, privateKey, spreadsheetId, range }
}

function parseMasterDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  try {
    const d = parse(s, 'MMM d yyyy', new Date())
    if (Number.isNaN(d.getTime())) return null
    return format(d, 'yyyy-MM-dd')
  } catch {
    return null
  }
}

export async function fetchMasterMasterRecords(): Promise<MasterMasterRecord[]> {
  const { clientEmail, privateKey, spreadsheetId, range } = getMasterEnv()
  const auth = createAuth(clientEmail, privateKey)
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    })
    const rows = res.data.values
    if (!rows || rows.length < 2) return []

    const result: MasterMasterRecord[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const date = parseMasterDate(row[0])
      if (!date) continue
      result.push({
        date,
        active_clients: parseNumber(row[1]),
        reschedule: parseNumber(row[2]),
        nsf_recurring: parseNumber(row[3]),
        cancels: parseNumber(row[4]),
        poc: parseNumber(row[5]),
        paid_retention: parseNumber(row[6]),
        sales: parseNumber(row[7]),
        fp_paid: parseNumber(row[8]),
        fp_nsf: parseNumber(row[9]),
        fp_gray: parseNumber(row[10]),
        fp_ratio: parseRatio(row[11]),
      })
    }
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Google Sheets master read failed:', message)
    return []
  }
}

function getCancelEnv() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SHEETS_CANCEL_SPREADSHEET_ID
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_CANCEL_SPREADSHEET_ID must be set')
  }
  const range = process.env.GOOGLE_SHEETS_CANCEL_RANGE?.trim() || 'Month over Month!A1:F400'
  return { clientEmail, privateKey, spreadsheetId, range }
}

// The "Month over Month" tab is hand-built: a standalone year row (e.g. "2025"),
// followed by repeating blocks of a month header row ("September","Request","POC",
// "Loss(request-paid)","Paid/Retained","Retained ratio") and three data rows
// ("Zero months", "1-99", "Total"), separated by blank rows.
export async function fetchCancelMasterRecords(): Promise<CancelMasterRecord[]> {
  const { clientEmail, privateKey, spreadsheetId, range } = getCancelEnv()
  const auth = createAuth(clientEmail, privateKey)
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    const rows = res.data.values
    if (!rows || rows.length === 0) return []

    let currentYear = String(new Date().getFullYear())
    const records: CancelMasterRecord[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const col0 = String(row[0] ?? '').trim()

      if (/^(19|20)\d{2}$/.test(col0) && row.slice(1).every((c) => String(c ?? '').trim() === '')) {
        currentYear = col0
        continue
      }

      const monthPart = col0.split(/\s+/)[0]?.toLowerCase()
      const isHeader = MONTH_NAMES.includes(monthPart)
        && String(row[1] ?? '').trim().toLowerCase() === 'request'
        && String(row[2] ?? '').trim().toLowerCase() === 'poc'
      if (!isHeader) continue

      const yearMatch = col0.match(/(\d{4})/)
      const year = yearMatch ? yearMatch[1] : currentYear
      const monthName = col0.replace(/\d{4}/, '').trim()

      const buckets: CancelMasterBucket[] = []
      for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
        const dataRow = rows[j]
        const bucketLabel = String(dataRow[0] ?? '').trim()
        if (!bucketLabel) continue
        const bucketLower = bucketLabel.toLowerCase()
        const nextMonthPart = bucketLower.split(/\s+/)[0]
        if (MONTH_NAMES.includes(nextMonthPart) && String(dataRow[1] ?? '').trim().toLowerCase() === 'request') break
        if (bucketLower === 'zero months' || bucketLower === '1-99' || bucketLower === 'total') {
          buckets.push({
            bucket: bucketLabel,
            request: parseNumber(dataRow[1]),
            poc: parseNumber(dataRow[2]),
            loss: parseNumber(dataRow[3]),
            paid_retained: parseNumber(dataRow[4]),
            retained_ratio: parseRatio(dataRow[5]),
          })
        }
        if (bucketLower === 'total') break
      }

      const total = buckets.find((b) => b.bucket.toLowerCase() === 'total')
        ?? buckets[buckets.length - 1]
        ?? { bucket: 'Total', request: 0, poc: 0, loss: 0, paid_retained: 0, retained_ratio: 0 }

      records.push({ month: `${monthName} ${year}`, buckets, total })
    }

    return records
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Google Sheets cancel master read failed:', message)
    return []
  }
}

function getNsfEnv() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SHEETS_NSF_SPREADSHEET_ID
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_NSF_SPREADSHEET_ID must be set')
  }
  const range = process.env.GOOGLE_SHEETS_NSF_RANGE?.trim() || '2026 Month over month!A1:I400'
  return { clientEmail, privateKey, spreadsheetId, range }
}

// The "Month over month" tab packs two months side by side per block: a header
// row with month names in column A and F, four "Was NSF: is now" category rows,
// then "Total revenue Lost for month" / "Total Revenue RECOUPED" rows, separated
// by blank rows before the next month pair.
export async function fetchNsfMasterRecords(): Promise<NsfMasterRecord[]> {
  const { clientEmail, privateKey, spreadsheetId, range } = getNsfEnv()
  const auth = createAuth(clientEmail, privateKey)
  const sheets = google.sheets({ version: 'v4', auth })
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
    const rows = res.data.values
    if (!rows || rows.length === 0) return []

    const tabName = range.split('!')[0]
    const yearMatch = tabName.match(/(\d{4})/)
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear())

    function extractBlock(block: unknown[][], monthLabel: string, startCol: number): NsfMasterRecord | null {
      const categories: NsfMasterCategory[] = []
      let totalLost = 0
      let totalRecouped = 0
      for (const r of block) {
        const label = String(r[startCol] ?? '').trim().toLowerCase()
        if (label === 'was nsf: is now') {
          categories.push({
            category: String(r[startCol + 1] ?? '').trim(),
            amount: parseNumber(r[startCol + 2]),
            count: parseNumber(r[startCol + 3]),
          })
        } else if (label.startsWith('total revenue lost')) {
          totalLost = parseNumber(r[startCol + 1])
        } else if (label.startsWith('total revenue recouped')) {
          totalRecouped = parseNumber(r[startCol + 1])
        }
      }
      if (categories.length === 0) return null
      return { month: monthLabel, categories, total_revenue_lost: totalLost, total_revenue_recouped: totalRecouped }
    }

    const records: NsfMasterRecord[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const col0 = String(row[0] ?? '').trim().toLowerCase()
      if (!MONTH_NAMES.includes(col0)) continue

      let end = rows.length
      for (let k = i + 1; k < rows.length; k++) {
        const nextCol0 = String(rows[k][0] ?? '').trim().toLowerCase()
        if (MONTH_NAMES.includes(nextCol0)) { end = k; break }
      }
      const block = rows.slice(i + 1, end)

      const leftLabel = String(row[0]).trim()
      const left = extractBlock(block, `${leftLabel} ${year}`, 0)
      if (left) records.push(left)

      const rightLabel = String(row[5] ?? '').trim()
      if (rightLabel) {
        const right = extractBlock(block, `${rightLabel} ${year}`, 5)
        if (right) records.push(right)
      }
    }

    return records
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Google Sheets NSF master read failed:', message)
    return []
  }
}

import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

export interface SheetTaskRow {
  agent_id: string
  log_date: string
  tasks_assigned: number
}

export async function fetchSheetTasks(): Promise<SheetTaskRow[]> {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_SPREADSHEET_ID must be set')
  }

  const auth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A1:Z',
  })

  const rows = res.data.values
  if (!rows || rows.length < 2) return []

  const headers = rows[0].map((h: string) => h.toLowerCase().trim())
  const agentIdx = headers.indexOf('agent')
  const dateIdx = headers.indexOf('date')
  const tasksIdx = headers.indexOf('tasks_assigned')

  if (agentIdx === -1 || dateIdx === -1 || tasksIdx === -1) {
    throw new Error('Sheet must contain agent, date and tasks_assigned columns')
  }

  const result: SheetTaskRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const agent = String(row[agentIdx] ?? '').trim()
    const date = String(row[dateIdx] ?? '').trim()
    const tasks = Number(row[tasksIdx] ?? '')
    if (!agent || !date || Number.isNaN(tasks)) continue
    result.push({
      agent_id: agent,
      log_date: date,
      tasks_assigned: tasks,
    })
  }

  return result
}
